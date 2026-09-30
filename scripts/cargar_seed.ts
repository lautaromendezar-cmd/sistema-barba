/**
 * Carga los productos y clientes de lib/seed.ts en la base, para tener con que
 * probar el sistema antes de que lleguen los archivos de verdad (la lista de
 * 5000 productos y la planilla de clientes).
 *
 *   npx tsx scripts/cargar_seed.ts
 *
 * Entra como federico en vez de saltearse la seguridad: si las politicas
 * estuvieran mal, este script tiene que fallar igual que fallaria la app.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { seedDB } from "../lib/seed";

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

const CLAVE = process.argv[2] ?? env("CLAVE_DEV_FEDERICO");

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({
    email: "federico@barba.local",
    password: CLAVE,
  });
  if (errorLogin) throw new Error(`No pude entrar: ${errorLogin.message}`);
  console.log("Entré como federico");

  const db = seedDB();

  const productos = db.productos.map((p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    bodega: p.bodega,
    seccion: p.seccion,
    presentacion: p.presentacion,
    unidades_por_bulto: p.unidadesPorBulto,
    precio_lista: p.precioLista,
    en_lista_actual: p.enListaActual,
  }));

  const { error: errorProd, count: cuantosProd } = await supabase
    .from("productos")
    .upsert(productos, { onConflict: "codigo", count: "exact" });
  if (errorProd) throw new Error(`Productos: ${errorProd.message}`);
  console.log(`Productos cargados: ${cuantosProd ?? productos.length}`);

  for (const c of db.clientes) {
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombre: c.nombre, telefono: c.telefono, notas: c.notas })
      .select()
      .single();
    if (error) {
      console.log(`  cliente "${c.nombre}": ${error.message}`);
      continue;
    }
    if (c.direccion) {
      await supabase.from("cliente_direcciones").insert({
        cliente_id: data.id,
        direccion: c.direccion,
        localidad: c.localidad,
        es_principal: true,
      });
    }
  }
  console.log(`Clientes cargados: ${db.clientes.length}`);

  await supabase.auth.signOut();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
