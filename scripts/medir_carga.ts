/**
 * Mide lo que cuesta cada consulta de cargarTodo(): tiempo y tamaño.
 *
 *   npx tsx scripts/medir_carga.ts
 *
 * Sirve para comparar antes y después de tocar la carga de datos. Los tiempos
 * dependen de la red, así que lo que importa es la comparación entre corridas
 * de la misma sesión, no el número suelto.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(clave: string): string {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith(clave + "=")) return linea.slice(clave.length + 1).trim();
  }
  throw new Error(`Falta ${clave} en .env.local`);
}

const supabase = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
);

const consultas: Array<[string, () => PromiseLike<{ data: unknown }>]> = [
  ["productos", () => supabase.from("productos").select("*").order("nombre")],
  ["clientes", () => supabase.from("clientes").select("*, cliente_direcciones(*)").order("nombre")],
  ["movimientos", () => supabase.from("movimientos").select("*").order("fecha", { ascending: false }).limit(5000)],
  ["remitos", () => supabase.from("remitos").select("*, remito_lineas(*)").order("creado_at", { ascending: false }).limit(500)],
  ["ingresos", () => supabase.from("ingresos").select("*, ingreso_lineas(*)").order("creado_at", { ascending: false }).limit(500)],
  ["stock_fisico", () => supabase.from("stock_fisico").select("*")],
  ["stock_a_pedir", () => supabase.from("stock_a_pedir").select("*")],
  ["perfiles", () => supabase.from("perfiles").select("id, nombre")],
  ["proveedores", () => supabase.from("proveedores").select("*").order("nombre")],
];

async function main() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "federico@barba.local",
    password: env("CLAVE_DEV"),
  });
  if (error) throw new Error(`No se pudo entrar: ${error.message}`);

  console.log("consulta         filas     KB    ms   bytes/fila");
  const medido = new Map<string, { filas: number; kb: number; ms: number }>();
  for (const [nombre, hacer] of consultas) {
    const t0 = performance.now();
    const { data } = await hacer();
    const ms = performance.now() - t0;
    const filas = Array.isArray(data) ? data.length : 0;
    const kb = JSON.stringify(data ?? []).length / 1024;
    medido.set(nombre, { filas, kb, ms });
    const porFila = filas ? (kb * 1024) / filas : 0;
    console.log(
      `${nombre.padEnd(15)} ${String(filas).padStart(5)} ${kb.toFixed(0).padStart(6)} ${ms.toFixed(0).padStart(5)} ${porFila.toFixed(0).padStart(10)}`,
    );
  }

  const kb = (n: string) => medido.get(n)?.kb ?? 0;
  const porFila = (n: string) => {
    const m = medido.get(n);
    return m && m.filas ? (m.kb * 1024) / m.filas : 0;
  };

  const todas = [...medido.keys()];
  const soloRemito = ["remitos", "stock_fisico", "stock_a_pedir"];
  const suma = (ns: string[]) => ns.reduce((a, n) => a + kb(n), 0);

  console.log("\nDespués de emitir un remito se vuelve a bajar:");
  console.log(`  antes:  ${todas.length} consultas, ${suma(todas).toFixed(0)} KB`);
  console.log(`  ahora:  ${soloRemito.length} consultas, ${suma(soloRemito).toFixed(0)} KB`);

  // Lo que se ve hoy son datos de ejemplo. La planilla que mandó el cliente
  // tiene 4.444 productos y 600 clientes: con el peso por fila ya medido se
  // puede estimar cuánto va a pesar cada recarga con el catálogo de verdad.
  const PRODUCTOS_REALES = 4444;
  const CLIENTES_REALES = 600;
  const productosKB = (porFila("productos") * PRODUCTOS_REALES) / 1024;
  const clientesKB = (porFila("clientes") * CLIENTES_REALES) / 1024;
  const stockKB = (porFila("stock_fisico") * PRODUCTOS_REALES) / 1024;

  console.log("\nProyección con el catálogo real (4.444 productos, 600 clientes):");
  console.log(`  antes:  ${(productosKB + clientesKB + stockKB * 2 + kb("remitos") + kb("ingresos") + kb("movimientos") + kb("perfiles") + kb("proveedores")).toFixed(0)} KB por operación`);
  // El stock ya no se pide entero: solo las filas distintas de cero, que son
  // los productos que se movieron, no los 4.444 del catálogo.
  console.log(`  ahora:  ${(kb("remitos") + kb("stock_fisico") + kb("stock_a_pedir")).toFixed(0)} KB por operación, de los cuales ${kb("remitos").toFixed(0)} son los remitos`);
  console.log(`          (el stock crece con los productos que se movieron, no con el catálogo)`);
}

main();
