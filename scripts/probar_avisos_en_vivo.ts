/**
 * Los avisos en vivo (migracion 0014): lo que hace una PC le llega a las otras,
 * y a nadie de afuera.
 *
 * Simula tres PC: Claudia y alguien sin cuenta (solo la clave publica, que esta
 * en el codigo del sitio) escuchan cambios de clientes y proveedores; Federico
 * toca un cliente y un proveedor. Claudia tiene que enterarse; el de afuera no.
 *
 * El cambio que hace Federico es reescribir las notas con el mismo valor: la
 * base registra un cambio y avisa, pero los datos quedan como estaban.
 *
 *   npx tsx scripts/probar_avisos_en_vivo.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(clave: string): string {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith(`${clave}=`))
      return linea.slice(clave.length + 1).replace(/^"|"$/g, "");
  }
  throw new Error(`Falta ${clave} en .env.local`);
}

const URL_ = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const nuevo = () =>
  createClient(URL_, ANON, { auth: { persistSession: false } });

async function entrar(sb: SupabaseClient, usuario: string) {
  const { error } = await sb.auth.signInWithPassword({
    email: `${usuario}@barba.local`,
    password: env(`CLAVE_DEV_${usuario.toUpperCase()}`),
  });
  if (error) throw new Error(`${usuario} no pudo entrar: ${error.message}`);
}

/** Se suscribe como lo hace la app y cuenta los avisos por tabla. */
async function escuchar(sb: SupabaseClient, nombre: string) {
  const recibidos: Record<string, number> = { clientes: 0, proveedores: 0 };
  const canal = sb.channel(`prueba-${nombre}`);
  for (const tabla of Object.keys(recibidos)) {
    canal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: tabla },
      () => recibidos[tabla]++,
    );
  }
  await new Promise<void>((listo, falla) => {
    const t = setTimeout(() => falla(new Error(`${nombre}: no conecto`)), 15000);
    canal.subscribe((estado) => {
      if (estado === "SUBSCRIBED") {
        clearTimeout(t);
        listo();
      }
    });
  });
  return recibidos;
}

async function main() {
  const claudia = nuevo();
  const intruso = nuevo();
  const federico = nuevo();
  await entrar(claudia, "claudia");
  await entrar(federico, "federico");

  const deClaudia = await escuchar(claudia, "claudia");
  const delIntruso = await escuchar(intruso, "intruso");
  // Realtime tarda un momento en empezar a mirar la tabla despues de suscribir.
  await new Promise((r) => setTimeout(r, 5000));

  for (const tabla of ["clientes", "proveedores"]) {
    const { data, error } = await federico
      .from(tabla)
      .select("id, notas")
      .limit(1)
      .single();
    if (error) throw new Error(`no se pudo leer ${tabla}: ${error.message}`);
    const res = await federico
      .from(tabla)
      .update({ notas: data.notas })
      .eq("id", data.id);
    if (res.error) throw new Error(`no se pudo tocar ${tabla}: ${res.error.message}`);
  }

  await new Promise((r) => setTimeout(r, 5000));

  let mal = 0;
  const chequear = (desc: string, ok: boolean) => {
    console.log(`  ${ok ? "OK  " : "MAL "} ${desc}`);
    if (!ok) mal++;
  };
  chequear("Claudia se entera del cliente que tocó Federico", deClaudia.clientes > 0);
  chequear("Claudia se entera del proveedor que tocó Federico", deClaudia.proveedores > 0);
  chequear(
    "alguien sin cuenta no recibe nada",
    delIntruso.clientes === 0 && delIntruso.proveedores === 0,
  );

  await Promise.all([claudia, intruso, federico].map((s) => s.removeAllChannels()));
  console.log(mal ? `\n${mal} problema(s).` : "\nTodo OK.");
  process.exit(mal ? 1 : 0);
}

void main();
