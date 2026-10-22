/**
 * Revisión de coherencia de la base (desde el 22-oct-2026, primer mes de uso).
 *
 * SOLO LEE. Controla que el stock cuadre con los papeles que lo mueven y marca
 * lo que conviene mirar con el equipo. La usan scripts/revisar_datos.ts (a mano)
 * y /api/revision-semanal (el cron de Vercel de los sábados, que manda el mail).
 *
 * Duros (⚠ = algo está mal en la base, mirarlo antes de tocar nada):
 *   1. Cada remito emitido descontó exactamente sus líneas entregadas.
 *   2. Cada remito anulado quedó en cero neto.
 *   3. Cada ingreso sumó exactamente sus líneas; los anulados, cero neto.
 *   4. No hay movimientos huérfanos (de ingreso/egreso sin papel).
 * Blandos (⚠ = para preguntarle al equipo, no es un error del sistema):
 *   5. Productos en stock negativo.
 *   6. Ingresos vacíos sin anular.
 *   7. Borradores de remito de más de un día.
 *   8. Líneas pendientes de entregar con más de 7 días.
 *   9. Saltos en la numeración de remitos.
 *  10. Ajustes manuales de stock en el período (quién, qué, cuánto).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Fila = Record<string, unknown>;

export type Chequeo = { titulo: string; duro: boolean; problemas: string[] };

export type Revision = {
  fecha: Date;
  totales: { remitos: number; ingresos: number; movimientos: number };
  chequeos: Chequeo[];
  duros: number;
  blandos: number;
};

const DIA = 864e5;

export const fechaCorta = (iso: unknown) =>
  new Date(String(iso)).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

const nroRemito = (n: unknown) => `R-${String(n).padStart(4, "0")}`;

/** Supabase corta en 1.000 filas sin avisar: se trae todo de a páginas. */
async function todo(
  sb: SupabaseClient,
  tabla: string,
  columnas: string,
  orden = "id",
): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb
      .from(tabla)
      .select(columnas)
      .order(orden)
      .range(d, d + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...((data ?? []) as unknown as Fila[]));
    if (!data || data.length < 1000) return filas;
  }
}

function agrupar(filas: Fila[], clave: string) {
  const m = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = f[clave] as string | null;
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return m;
}

/** Suma por producto de una lista de filas. */
function porProducto(filas: Fila[], cantidad: (f: Fila) => number) {
  const m = new Map<string, number>();
  for (const f of filas) {
    const p = String(f.producto_id);
    m.set(p, (m.get(p) ?? 0) + cantidad(f));
  }
  return m;
}

/** Revisa la base con la sesión que ya tenga `sb` (tiene que poder leer todo). */
export async function revisar(sb: SupabaseClient, dias = 7): Promise<Revision> {
  const desde = Date.now() - dias * DIA;

  const [prods, perfiles, remitos, rLineas, ingresos, iLineas, movs, stock] =
    await Promise.all([
      todo(sb, "productos", "id, codigo, nombre"),
      todo(sb, "perfiles", "id, nombre"),
      todo(sb, "remitos", "id, numero, estado, creado_at, emitido_at"),
      todo(sb, "remito_lineas", "id, remito_id, producto_id, unidades_totales, entregado"),
      todo(sb, "ingresos", "id, bodega, nro_remito_proveedor, creado_at, anulado_at"),
      todo(sb, "ingreso_lineas", "id, ingreso_id, producto_id, unidades_totales"),
      todo(sb, "movimientos", "id, producto_id, tipo, unidades, fecha, usuario_id, nota, remito_id, ingreso_id"),
      todo(sb, "stock_fisico", "producto_id, unidades", "producto_id"),
    ]);

  const productos = new Map(prods.map((p) => [String(p.id), p]));
  const nombreProd = (id: unknown) => {
    const p = productos.get(String(id));
    return p ? `${p.codigo} ${p.nombre}` : String(id);
  };
  const persona = new Map(perfiles.map((p) => [String(p.id), String(p.nombre)]));

  const diferencias = (esperado: Map<string, number>, real: Map<string, number>) => {
    const out: string[] = [];
    for (const p of new Set([...esperado.keys(), ...real.keys()])) {
      const e = esperado.get(p) ?? 0;
      const r = real.get(p) ?? 0;
      if (e !== r) out.push(`${nombreProd(p)}: esperado ${e}, movió ${r}`);
    }
    return out;
  };

  const movsRemito = agrupar(movs, "remito_id");
  const movsIngreso = agrupar(movs, "ingreso_id");
  const lineasRemito = agrupar(rLineas, "remito_id");
  const lineasIngreso = agrupar(iLineas, "ingreso_id");
  const neto = (ms: Fila[]) => porProducto(ms, (m) => Number(m.unidades));

  // 1 y 2. Remitos
  const malEmitidos: string[] = [];
  const malAnulados: string[] = [];
  for (const r of remitos) {
    const ms = movsRemito.get(String(r.id)) ?? [];
    if (r.estado === "emitido") {
      const esperado = porProducto(
        (lineasRemito.get(String(r.id)) ?? []).filter(
          (l) => l.producto_id && l.entregado && Number(l.unidades_totales) > 0,
        ),
        (l) => -Number(l.unidades_totales),
      );
      for (const d of diferencias(esperado, neto(ms)))
        malEmitidos.push(`${nroRemito(r.numero)} · ${d}`);
    } else if (r.estado === "anulado") {
      for (const [p, n] of neto(ms))
        if (n !== 0) malAnulados.push(`${nroRemito(r.numero)} · ${nombreProd(p)} quedó en ${n}`);
    } else if (ms.length > 0) {
      malEmitidos.push(`borrador con movimientos de stock (creado ${fechaCorta(r.creado_at)})`);
    }
  }

  // 3. Ingresos (y de paso, los vacíos)
  const malIngresos: string[] = [];
  const vacios: string[] = [];
  for (const g of ingresos) {
    const ls = lineasIngreso.get(String(g.id)) ?? [];
    const quien = `${g.bodega ?? "?"} ${g.nro_remito_proveedor || "s/nº"} (${fechaCorta(g.creado_at)})`;
    const esperado = g.anulado_at
      ? new Map<string, number>()
      : porProducto(
          ls.filter((l) => Number(l.unidades_totales) > 0),
          (l) => Number(l.unidades_totales),
        );
    for (const d of diferencias(esperado, neto(movsIngreso.get(String(g.id)) ?? [])))
      malIngresos.push(`${quien} · ${d}`);
    if (ls.length === 0 && !g.anulado_at) vacios.push(quien);
  }

  // 4. Huérfanos
  const huerfanos = movs
    .filter(
      (m) =>
        ["egreso", "ingreso", "anulacion"].includes(String(m.tipo)) &&
        !m.remito_id &&
        !m.ingreso_id,
    )
    .map((m) => `${m.tipo} ${m.unidades} de ${nombreProd(m.producto_id)} (${fechaCorta(m.fecha)})`);

  // 5. Negativos
  const negativos = stock
    .filter((s) => Number(s.unidades) < 0)
    .map((s) => `${nombreProd(s.producto_id)}: ${s.unidades} u`);

  // 7. Borradores viejos
  const borradores = remitos
    .filter((r) => r.estado === "borrador" && Date.parse(String(r.creado_at)) < Date.now() - DIA)
    .map((r) => `creado ${fechaCorta(r.creado_at)}`);

  // 8. Pendientes viejos
  const emitidos = new Map(
    remitos.filter((r) => r.estado === "emitido").map((r) => [String(r.id), r]),
  );
  const pendientes = rLineas.flatMap((l) => {
    const r = emitidos.get(String(l.remito_id));
    if (!r || l.entregado || Date.parse(String(r.emitido_at)) >= Date.now() - 7 * DIA)
      return [];
    const que = l.producto_id ? nombreProd(l.producto_id) : "línea libre";
    return [`${nroRemito(r.numero)} (${fechaCorta(r.emitido_at)}) · ${que}: ${l.unidades_totales} u`];
  });

  // 9. Numeración
  const numeros = remitos
    .map((r) => Number(r.numero))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const saltos: string[] = [];
  for (let k = 1; k < numeros.length; k++)
    if (numeros[k] - numeros[k - 1] > 1)
      saltos.push(`entre ${nroRemito(numeros[k - 1])} y ${nroRemito(numeros[k])}`);

  // 10. Ajustes del período
  const ajustes = movs
    .filter(
      (m) =>
        ["ajuste", "rotura", "vencimiento"].includes(String(m.tipo)) &&
        Date.parse(String(m.fecha)) >= desde,
    )
    .sort((a, b) => Date.parse(String(a.fecha)) - Date.parse(String(b.fecha)))
    .map(
      (m) =>
        `${fechaCorta(m.fecha)} · ${persona.get(String(m.usuario_id)) ?? "?"} · ${m.tipo} ${Number(m.unidades) > 0 ? "+" : ""}${m.unidades} ${nombreProd(m.producto_id)}${m.nota ? ` · «${m.nota}»` : ""}`,
    );

  const chequeos: Chequeo[] = [
    { titulo: "Remitos emitidos: descontaron lo que dicen", duro: true, problemas: malEmitidos },
    { titulo: "Remitos anulados: devolvieron todo", duro: true, problemas: malAnulados },
    { titulo: "Ingresos: sumaron lo que dicen (anulados en cero)", duro: true, problemas: malIngresos },
    { titulo: "Movimientos sin remito ni ingreso", duro: true, problemas: huerfanos },
    { titulo: "Productos en stock negativo (falta cargar un ingreso o se vendió de más)", duro: false, problemas: negativos },
    { titulo: "Ingresos vacíos sin anular (se pueden anular desde la pantalla)", duro: false, problemas: vacios },
    { titulo: "Remitos en borrador de más de un día", duro: false, problemas: borradores },
    { titulo: "Pendientes de entregar con más de 7 días", duro: false, problemas: pendientes },
    { titulo: "Saltos en la numeración de remitos (un emitir que falló a la mitad)", duro: false, problemas: saltos },
    { titulo: `Ajustes manuales de stock en los últimos ${dias} días`, duro: false, problemas: ajustes },
  ];

  return {
    fecha: new Date(),
    totales: { remitos: remitos.length, ingresos: ingresos.length, movimientos: movs.length },
    chequeos,
    duros: chequeos.filter((c) => c.duro && c.problemas.length > 0).length,
    blandos: chequeos.filter((c) => !c.duro && c.problemas.length > 0).length,
  };
}

/** La misma revisión en texto plano: la consola y el cuerpo del mail. */
export function comoTexto(r: Revision, maxPorChequeo = 30): string {
  const lineas = [
    `Revisión ${fechaCorta(r.fecha)} · ${r.totales.remitos} remitos, ${r.totales.ingresos} ingresos, ${r.totales.movimientos} movimientos`,
    "",
  ];
  r.chequeos.forEach((c, i) => {
    if (i > 0 && c.duro !== r.chequeos[i - 1].duro) lineas.push("");
    if (c.problemas.length === 0) {
      lineas.push(`OK  ${c.titulo}`);
      return;
    }
    lineas.push(`⚠   ${c.titulo} (${c.problemas.length})`);
    for (const p of c.problemas.slice(0, maxPorChequeo)) lineas.push(`      ${p}`);
    if (c.problemas.length > maxPorChequeo)
      lineas.push(`      … y ${c.problemas.length - maxPorChequeo} más`);
  });
  lineas.push("", resumen(r));
  return lineas.join("\n");
}

export function resumen(r: Revision): string {
  return `${r.duros === 0 ? "Base coherente." : `${r.duros} problema(s) de la base: NO tocar datos, mirarlo antes.`} ${r.blandos} punto(s) para revisar con el equipo.`;
}
