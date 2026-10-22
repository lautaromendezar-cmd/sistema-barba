/**
 * Revisión semanal de coherencia (desde el 22-oct-2026, primer mes de uso).
 *
 * SOLO LEE: entra como federico con supabase-js y no escribe nada. Controla
 * que el stock cuadre con los papeles que lo mueven y marca lo que conviene
 * mirar con el equipo. Cada chequeo sale con OK o ⚠ y el detalle.
 *
 *   npx tsx scripts/revisar_datos.ts              # ajustes de los últimos 7 días
 *   npx tsx scripts/revisar_datos.ts --dias 30
 *
 * Duros (⚠ = algo está mal en la base, avisar antes de tocar nada):
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
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(clave: string): string {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith(`${clave}=`))
      return linea.slice(clave.length + 1).replace(/^"|"$/g, "");
  }
  throw new Error(`Falta ${clave} en .env.local`);
}

const i = process.argv.indexOf("--dias");
const DIAS = i > 0 ? Number(process.argv[i + 1]) : 7;
const desde = new Date(Date.now() - DIAS * 864e5);

const sb = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  { auth: { persistSession: false } },
);

type Fila = Record<string, unknown>;

/** Supabase corta en 1.000 filas sin avisar: se trae todo de a páginas. */
async function todo(tabla: string, columnas: string, orden = "id"): Promise<Fila[]> {
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

const fecha = (iso: unknown) =>
  new Date(String(iso)).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

let duros = 0;
let blandos = 0;
function informe(titulo: string, problemas: string[], duro: boolean) {
  if (problemas.length === 0) {
    console.log(`OK  ${titulo}`);
    return;
  }
  if (duro) duros++;
  else blandos++;
  console.log(`⚠   ${titulo} (${problemas.length})`);
  for (const p of problemas.slice(0, 30)) console.log(`      ${p}`);
  if (problemas.length > 30) console.log(`      … y ${problemas.length - 30} más`);
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

function diferencias(esperado: Map<string, number>, real: Map<string, number>) {
  const out: string[] = [];
  for (const p of new Set([...esperado.keys(), ...real.keys()])) {
    const e = esperado.get(p) ?? 0;
    const r = real.get(p) ?? 0;
    if (e !== r) out.push(`${nombreProd(p)}: esperado ${e}, movió ${r}`);
  }
  return out;
}

let productos = new Map<string, Fila>();
const nombreProd = (id: string) => {
  const p = productos.get(id);
  return p ? `${p.codigo} ${p.nombre}` : id;
};

async function main() {
  const { error } = await sb.auth.signInWithPassword({
    email: "federico@barba.local",
    password: env("CLAVE_DEV_FEDERICO"),
  });
  if (error) throw new Error(`No pude entrar como federico: ${error.message}`);
  // Recién emitido, la base a veces lo rechaza con «JWT issued at future»
  // (relojes desfasados un segundo entre auth y la base).
  await new Promise((r) => setTimeout(r, 3000));

  const [prods, perfiles, remitos, rLineas, ingresos, iLineas, movs, stock] =
    await Promise.all([
      todo("productos", "id, codigo, nombre, unidades_por_bulto"),
      todo("perfiles", "id, nombre"),
      todo("remitos", "id, numero, estado, creado_at, emitido_at, anulado_at, cliente_id"),
      todo("remito_lineas", "id, remito_id, producto_id, unidades_totales, entregado"),
      todo("ingresos", "id, bodega, nro_remito_proveedor, creado_at, anulado_at"),
      todo("ingreso_lineas", "id, ingreso_id, producto_id, unidades_totales"),
      todo("movimientos", "id, producto_id, tipo, unidades, fecha, usuario_id, nota, remito_id, ingreso_id"),
      todo("stock_fisico", "producto_id, codigo, unidades", "producto_id"),
    ]);
  productos = new Map(prods.map((p) => [String(p.id), p]));
  const persona = new Map(perfiles.map((p) => [String(p.id), String(p.nombre)]));

  console.log(
    `Revisión ${fecha(new Date())} · ${remitos.length} remitos, ${ingresos.length} ingresos, ${movs.length} movimientos\n`,
  );

  const agrupar = (filas: Fila[], clave: string) => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) {
      const k = f[clave] as string | null;
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return m;
  };
  const movsRemito = agrupar(movs, "remito_id");
  const movsIngreso = agrupar(movs, "ingreso_id");
  const lineasRemito = agrupar(rLineas, "remito_id");
  const lineasIngreso = agrupar(iLineas, "ingreso_id");

  // 1 y 2. Remitos
  const malEmitidos: string[] = [];
  const malAnulados: string[] = [];
  for (const r of remitos) {
    const ms = movsRemito.get(String(r.id)) ?? [];
    const nro = `R-${String(r.numero).padStart(4, "0")}`;
    if (r.estado === "emitido") {
      const esperado = porProducto(
        (lineasRemito.get(String(r.id)) ?? []).filter(
          (l) => l.producto_id && l.entregado && Number(l.unidades_totales) > 0,
        ),
        (l) => -Number(l.unidades_totales),
      );
      const real = porProducto(ms, (m) => Number(m.unidades));
      for (const d of diferencias(esperado, real)) malEmitidos.push(`${nro} · ${d}`);
    } else if (r.estado === "anulado") {
      const neto = porProducto(ms, (m) => Number(m.unidades));
      for (const [p, n] of neto)
        if (n !== 0) malAnulados.push(`${nro} · ${nombreProd(p)} quedó en ${n}`);
    } else if (ms.length > 0) {
      malEmitidos.push(`borrador con movimientos de stock (creado ${fecha(r.creado_at)})`);
    }
  }
  informe("Remitos emitidos: descontaron lo que dicen", malEmitidos, true);
  informe("Remitos anulados: devolvieron todo", malAnulados, true);

  // 3. Ingresos
  const malIngresos: string[] = [];
  const vacios: string[] = [];
  for (const g of ingresos) {
    const ms = movsIngreso.get(String(g.id)) ?? [];
    const ls = lineasIngreso.get(String(g.id)) ?? [];
    const quien = `${g.bodega ?? "?"} ${g.nro_remito_proveedor || "s/nº"} (${fecha(g.creado_at)})`;
    const real = porProducto(ms, (m) => Number(m.unidades));
    const esperado = g.anulado_at
      ? new Map<string, number>()
      : porProducto(
          ls.filter((l) => Number(l.unidades_totales) > 0),
          (l) => Number(l.unidades_totales),
        );
    for (const d of diferencias(esperado, real)) malIngresos.push(`${quien} · ${d}`);
    if (ls.length === 0 && !g.anulado_at) vacios.push(quien);
  }
  informe("Ingresos: sumaron lo que dicen (anulados en cero)", malIngresos, true);

  // 4. Huérfanos
  const huerfanos = movs
    .filter(
      (m) =>
        (["egreso", "ingreso", "anulacion"].includes(String(m.tipo)) &&
          !m.remito_id &&
          !m.ingreso_id),
    )
    .map((m) => `${m.tipo} ${m.unidades} de ${nombreProd(String(m.producto_id))} (${fecha(m.fecha)})`);
  informe("Movimientos sin remito ni ingreso", huerfanos, true);

  console.log("");

  // 5. Negativos
  const negativos = stock
    .filter((s) => Number(s.unidades) < 0)
    .map((s) => `${nombreProd(String(s.producto_id))}: ${s.unidades} u`);
  informe("Productos en stock negativo (falta cargar un ingreso o se vendió de más)", negativos, false);

  // 6. Ingresos vacíos
  informe("Ingresos vacíos sin anular (se pueden anular desde la pantalla)", vacios, false);

  // 7. Borradores viejos
  const ayer = Date.now() - 864e5;
  const borradores = remitos
    .filter((r) => r.estado === "borrador" && Date.parse(String(r.creado_at)) < ayer)
    .map((r) => `creado ${fecha(r.creado_at)}`);
  informe("Remitos en borrador de más de un día", borradores, false);

  // 8. Pendientes viejos
  const semana = Date.now() - 7 * 864e5;
  const emitidoAt = new Map(
    remitos.filter((r) => r.estado === "emitido").map((r) => [String(r.id), r]),
  );
  const pendientes = rLineas
    .filter((l) => {
      const r = emitidoAt.get(String(l.remito_id));
      return r && !l.entregado && Date.parse(String(r.emitido_at)) < semana;
    })
    .map((l) => {
      const r = emitidoAt.get(String(l.remito_id))!;
      return `R-${String(r.numero).padStart(4, "0")} (${fecha(r.emitido_at)}) · ${l.producto_id ? nombreProd(String(l.producto_id)) : "línea libre"}: ${l.unidades_totales} u`;
    });
  informe("Pendientes de entregar con más de 7 días", pendientes, false);

  // 9. Numeración
  const numeros = remitos
    .map((r) => Number(r.numero))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const saltos: string[] = [];
  for (let k = 1; k < numeros.length; k++)
    if (numeros[k] - numeros[k - 1] > 1)
      saltos.push(`entre R-${String(numeros[k - 1]).padStart(4, "0")} y R-${String(numeros[k]).padStart(4, "0")}`);
  informe("Saltos en la numeración de remitos (un emitir que falló a la mitad)", saltos, false);

  // 10. Ajustes del período
  const ajustes = movs
    .filter(
      (m) =>
        ["ajuste", "rotura", "vencimiento"].includes(String(m.tipo)) &&
        Date.parse(String(m.fecha)) >= desde.getTime(),
    )
    .sort((a, b) => Date.parse(String(a.fecha)) - Date.parse(String(b.fecha)))
    .map(
      (m) =>
        `${fecha(m.fecha)} · ${persona.get(String(m.usuario_id)) ?? "?"} · ${m.tipo} ${Number(m.unidades) > 0 ? "+" : ""}${m.unidades} ${nombreProd(String(m.producto_id))}${m.nota ? ` · «${m.nota}»` : ""}`,
    );
  informe(`Ajustes manuales de stock en los últimos ${DIAS} días (para revisar con el equipo)`, ajustes, false);

  console.log(
    `\n${duros === 0 ? "Base coherente." : `${duros} problema(s) de la base: NO tocar datos, mirarlo antes.`} ${blandos} punto(s) para revisar con el equipo.`,
  );
  await sb.auth.signOut();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
