/**
 * Revisión de coherencia a mano (la lógica está en lib/revision.ts; la misma
 * corre sola todas las noches en /api/revision-diaria y llega por mail).
 *
 * SOLO LEE: entra como federico con supabase-js y no escribe nada.
 *
 *   npx tsx scripts/revisar_datos.ts              # ajustes de los últimos 7 días
 *   npx tsx scripts/revisar_datos.ts --dias 30
 *   npx tsx scripts/revisar_datos.ts --dias 1 --como claudia   # lo que llega en el mail
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { revisar, comoTexto } from "../lib/revision";

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
// Si la clave de federico de esta PC está vieja, se puede leer con otra cuenta
// del equipo: todas ven lo mismo.
const j = process.argv.indexOf("--como");
const COMO = j > 0 ? process.argv[j + 1].toLowerCase() : "federico";

async function main() {
  const sb = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
  const { error } = await sb.auth.signInWithPassword({
    email: `${COMO}@barba.local`,
    password: env(`CLAVE_DEV_${COMO.toUpperCase()}`),
  });
  if (error) throw new Error(`No pude entrar como ${COMO}: ${error.message}`);
  // Recién emitido, la base a veces lo rechaza con «JWT issued at future»
  // (relojes desfasados un segundo entre auth y la base).
  await new Promise((r) => setTimeout(r, 3000));

  console.log(comoTexto(await revisar(sb, DIAS)));
  await sb.auth.signOut();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
