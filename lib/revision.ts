/**
 * Revisión de coherencia de la base (desde el 22-oct-2026, primer mes de uso).
 *
 * SOLO LEE. Controla que el stock cuadre con los papeles que lo mueven y marca
 * lo que conviene mirar con el equipo. La usan scripts/revisar_datos.ts (a mano)
 * y /api/revision-diaria (el cron de Vercel de todas las noches, que manda el
 * mail). Desde el 28-oct-2026 trae además la actividad del período y el estado
 * del sistema (versión, tamaño de la base, catálogo).
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
import { NOVEDADES } from "./version";

type Fila = Record<string, unknown>;

export type Chequeo = { titulo: string; duro: boolean; problemas: string[] };

/** Lo que pasó en el período: para saber si el sistema se está usando. */
export type Actividad = {
  emitidos: number;
  importe: number;
  /** Remitos emitidos por persona. */
  porPersona: [string, number][];
  lineasOferta: number;
  anulados: number;
  ingresos: number;
  ingresosLineas: number;
  ingresosConCosto: number;
  ingresosAnulados: number;
  preciosCambiados: { excel: number; manual: number };
};

export type Estado = {
  version: string;
  commit: string;
  /** null si la función estado_base (0021) no respondió. */
  base: { bytes: number; ultimaMigracion: string; migraciones: number } | null;
  productos: number;
  enOferta: number;
  conCosto: number;
  aConsultar: number;
  clientes: number;
  segundos: number;
};

export type Revision = {
  fecha: Date;
  dias: number;
  totales: { remitos: number; ingresos: number; movimientos: number };
  chequeos: Chequeo[];
  duros: number;
  blandos: number;
  actividad: Actividad;
  estado: Estado;
};

const DIA = 864e5;

export const fechaCorta = (iso: unknown) =>
  new Date(String(iso)).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

const nroRemito = (n: unknown) => `R-${String(n).padStart(4, "0")}`;

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** Supabase corta en 1.000 filas sin avisar: se trae todo de a páginas. */
async function todo(
  sb: SupabaseClient,
  tabla: string,
  columnas: string,
  orden = "id",
): Promise<Fila[]> {
  const filas: Fila[] = [];
  let intento = 0;
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb
      .from(tabla)
      .select(columnas)
      .order(orden)
      .range(d, d + 999);
    if (error) {
      // Recién iniciada la sesión, la base a veces la rechaza con «JWT issued
      // at future»: el reloj de auth va unos segundos adelantado. Se espera.
      if (/issued at future/i.test(error.message) && intento < 6) {
        await new Promise((r) => setTimeout(r, 5000));
        intento++;
        d -= 1000;
        continue;
      }
      throw new Error(`${tabla}: ${error.message}`);
    }
    intento = 0;
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
  const inicio = Date.now();
  const desde = Date.now() - dias * DIA;

  const [prods, perfiles, remitos, rLineas, ingresos, iLineas, movs, stock, historial, clientes, costos] =
    await Promise.all([
      todo(sb, "productos", "id, codigo, nombre, precio_oferta, precio_a_consultar"),
      todo(sb, "perfiles", "id, nombre"),
      todo(sb, "remitos", "id, numero, estado, creado_at, emitido_at, anulado_at, ajuste_pct, usuario_id"),
      todo(sb, "remito_lineas", "id, remito_id, producto_id, unidades_totales, entregado, precio_unitario, lista"),
      todo(sb, "ingresos", "id, bodega, nro_remito_proveedor, creado_at, anulado_at"),
      todo(sb, "ingreso_lineas", "id, ingreso_id, producto_id, unidades_totales, costo_unitario"),
      todo(sb, "movimientos", "id, producto_id, tipo, unidades, fecha, usuario_id, nota, remito_id, ingreso_id"),
      todo(sb, "stock_fisico", "producto_id, unidades", "producto_id"),
      todo(sb, "precios_historial", "id, fecha, origen"),
      todo(sb, "clientes", "id, activo"),
      todo(sb, "ultimo_costo", "producto_id", "producto_id"),
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
    { titulo: `Ajustes manuales de stock ${dias === 1 ? "en el día" : `en los últimos ${dias} días`}`, duro: false, problemas: ajustes },
  ];

  // Actividad del período
  const enPeriodo = (iso: unknown) => Boolean(iso) && Date.parse(String(iso)) >= desde;
  const emitidosPeriodo = remitos.filter((r) => enPeriodo(r.emitido_at));
  const idsPeriodo = new Set(emitidosPeriodo.map((r) => String(r.id)));
  const lineasPeriodo = rLineas.filter((l) => idsPeriodo.has(String(l.remito_id)));
  // El importe cuenta solo los que siguen emitidos: un corregido se anula y su
  // reemplazo ya suma.
  const importe = emitidosPeriodo
    .filter((r) => r.estado === "emitido")
    .reduce((total, r) => {
      const sub = (lineasRemito.get(String(r.id)) ?? []).reduce(
        (a, l) => a + Number(l.unidades_totales) * Number(l.precio_unitario),
        0,
      );
      return total + sub * (1 + Number(r.ajuste_pct ?? 0) / 100);
    }, 0);
  const cuantos = new Map<string, number>();
  for (const r of emitidosPeriodo) {
    const quien = persona.get(String(r.usuario_id)) ?? "?";
    cuantos.set(quien, (cuantos.get(quien) ?? 0) + 1);
  }
  const ingresosPeriodo = ingresos.filter((g) => enPeriodo(g.creado_at));
  const idsIngresos = new Set(ingresosPeriodo.map((g) => String(g.id)));
  const iLineasPeriodo = iLineas.filter((l) => idsIngresos.has(String(l.ingreso_id)));
  const historialPeriodo = historial.filter((h) => enPeriodo(h.fecha));

  const actividad: Actividad = {
    emitidos: emitidosPeriodo.length,
    importe,
    porPersona: [...cuantos.entries()].sort((a, b) => b[1] - a[1]),
    lineasOferta: lineasPeriodo.filter((l) => l.lista === "oferta").length,
    anulados: remitos.filter((r) => enPeriodo(r.anulado_at)).length,
    ingresos: ingresosPeriodo.length,
    ingresosLineas: iLineasPeriodo.length,
    ingresosConCosto: iLineasPeriodo.filter((l) => l.costo_unitario != null).length,
    ingresosAnulados: ingresos.filter((g) => enPeriodo(g.anulado_at)).length,
    preciosCambiados: {
      excel: historialPeriodo.filter((h) => h.origen === "excel").length,
      manual: historialPeriodo.filter((h) => h.origen !== "excel").length,
    },
  };

  // Estado del sistema
  const { data: base } = await sb.rpc("estado_base");
  const estado: Estado = {
    version: NOVEDADES[0]?.version ?? "?",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    base: base
      ? {
          bytes: Number(base.bytes),
          ultimaMigracion: String(base.ultima_migracion ?? ""),
          migraciones: Number(base.migraciones ?? 0),
        }
      : null,
    productos: prods.length,
    enOferta: prods.filter((p) => p.precio_oferta != null).length,
    conCosto: costos.length,
    aConsultar: prods.filter((p) => p.precio_a_consultar).length,
    clientes: clientes.filter((c) => c.activo !== false).length,
    segundos: Math.round((Date.now() - inicio) / 1000),
  };

  return {
    fecha: new Date(),
    dias,
    totales: { remitos: remitos.length, ingresos: ingresos.length, movimientos: movs.length },
    chequeos,
    duros: chequeos.filter((c) => c.duro && c.problemas.length > 0).length,
    blandos: chequeos.filter((c) => !c.duro && c.problemas.length > 0).length,
    actividad,
    estado,
  };
}

/** «hoy» para la revisión diaria; «los últimos N días» para el resto. */
const periodo = (dias: number) => (dias === 1 ? "en el día" : `en los últimos ${dias} días`);

function actividadComoTexto(r: Revision): string[] {
  const a = r.actividad;
  const lineas = [`ACTIVIDAD ${periodo(r.dias).toUpperCase()}`];
  if (a.emitidos === 0 && a.ingresos === 0 && a.anulados === 0) {
    lineas.push("  Nada: ni remitos ni ingresos. (¿Feriado, o no están usando el sistema?)");
  } else {
    lineas.push(
      `  Remitos emitidos: ${a.emitidos}` +
        (a.emitidos ? ` · ${pesos(a.importe)}` : "") +
        (a.porPersona.length ? ` · ${a.porPersona.map(([q, n]) => `${q} ${n}`).join(", ")}` : ""),
    );
    if (a.lineasOferta) lineas.push(`  Líneas a precio de oferta: ${a.lineasOferta}`);
    if (a.anulados) lineas.push(`  Remitos anulados: ${a.anulados}`);
    lineas.push(
      `  Ingresos: ${a.ingresos}` +
        (a.ingresos ? ` · ${a.ingresosLineas} líneas, ${a.ingresosConCosto} con costo cargado` : ""),
    );
    if (a.ingresosAnulados) lineas.push(`  Ingresos anulados: ${a.ingresosAnulados}`);
  }
  const { excel, manual } = a.preciosCambiados;
  if (excel || manual)
    lineas.push(`  Precios cambiados: ${excel} desde Excel, ${manual} a mano`);
  return lineas;
}

function estadoComoTexto(r: Revision): string[] {
  const e = r.estado;
  const mb = e.base ? e.base.bytes / 1024 / 1024 : null;
  return [
    "ESTADO DEL SISTEMA",
    `  App: v${e.version}${e.commit ? ` (${e.commit})` : ""} · https://barba-remitos.vercel.app`,
    mb === null
      ? "  Base: no respondió estado_base()"
      : `  Base: ${mb.toFixed(0)} MB de 8 GB de disco · ${e.base!.migraciones} migraciones, la última ${e.base!.ultimaMigracion}`,
    `  Catálogo: ${e.productos} productos · ${e.enOferta} en oferta · ${e.conCosto} con costo · ${e.aConsultar} a consultar`,
    `  Clientes activos: ${e.clientes}`,
    "  Copias: Supabase Pro, diarias, 7 días (Database → Backups)",
    `  La revisión tardó ${e.segundos} s`,
  ];
}

/** La misma revisión en texto plano: la consola y el cuerpo del mail. */
export function comoTexto(r: Revision, maxPorChequeo = 30): string {
  const lineas = [
    `Revisión ${fechaCorta(r.fecha)} · ${r.totales.remitos} remitos, ${r.totales.ingresos} ingresos, ${r.totales.movimientos} movimientos`,
    "",
    ...actividadComoTexto(r),
    "",
    "COHERENCIA",
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
  lineas.push("", ...estadoComoTexto(r), "", resumen(r));
  return lineas.join("\n");
}

export function resumen(r: Revision): string {
  return `${r.duros === 0 ? "Base coherente." : `${r.duros} problema(s) de la base: NO tocar datos, mirarlo antes.`} ${r.blandos} punto(s) para revisar con el equipo.`;
}
