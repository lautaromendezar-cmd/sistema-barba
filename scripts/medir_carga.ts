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

// Igual que el store: Supabase corta en 1.000 filas sin avisar.
async function porPaginas(hacer: (d: number, h: number) => PromiseLike<{ data: unknown[] | null }>) {
  const filas: unknown[] = [];
  for (let d = 0; ; d += 1000) {
    const { data } = await hacer(d, d + 999);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < 1000) return { data: filas };
  }
}

const consultas: Array<[string, () => PromiseLike<{ data: unknown }>]> = [
  ["productos", () => porPaginas((d, h) => supabase.from("productos").select("*").order("nombre").order("codigo").range(d, h))],
  ["clientes", () => porPaginas((d, h) => supabase.from("clientes").select("*, cliente_direcciones(*)").order("nombre").order("id").range(d, h))],
  ["movimientos", () => supabase.from("movimientos").select("*").order("fecha", { ascending: false }).limit(5000)],
  ["remitos", () => supabase.from("remitos").select("*, remito_lineas(*)").order("creado_at", { ascending: false }).limit(500)],
  ["ingresos", () => supabase.from("ingresos").select("*, ingreso_lineas(*)").order("creado_at", { ascending: false }).limit(500)],
  ["stock_fisico", () => porPaginas((d, h) => supabase.from("stock_fisico").select("*").neq("unidades", 0).order("producto_id").range(d, h))],
  ["stock_a_pedir", () => porPaginas((d, h) => supabase.from("stock_a_pedir").select("*").neq("unidades", 0).order("producto_id").range(d, h))],
  ["perfiles", () => supabase.from("perfiles").select("id, nombre")],
  ["proveedores", () => supabase.from("proveedores").select("*").order("nombre")],
];

async function main() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "federico@barba.local",
    password: env("CLAVE_DEV_FEDERICO"),
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

  const todas = [...medido.keys()];
  const soloRemito = ["remitos", "stock_fisico", "stock_a_pedir"];
  const suma = (ns: string[]) => ns.reduce((a, n) => a + kb(n), 0);

  console.log("\nDespués de emitir un remito se vuelve a bajar:");
  console.log(`  antes:  ${todas.length} consultas, ${suma(todas).toFixed(0)} KB`);
  console.log(`  ahora:  ${soloRemito.length} consultas, ${suma(soloRemito).toFixed(0)} KB`);

  console.log(
    "\nEl stock se pide filtrado a los productos que se movieron, así que esa",
  );
  console.log(
    "consulta crece con el uso, no con el tamaño del catálogo.",
  );
}

main();
