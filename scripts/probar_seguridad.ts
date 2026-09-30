/**
 * Intenta entrar sin permiso, con la clave pública que cualquiera puede leer
 * del código del sitio.
 *
 *   npx tsx scripts/probar_seguridad.ts
 *
 * La anon key es pública por diseño: viaja en el navegador de cualquiera que
 * abra la app. Toda la seguridad real está en las políticas de la base, así
 * que lo único que vale es probar qué puede hacer alguien que tenga esa clave
 * y ninguna cuenta.
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

const URL_BASE = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const intruso = createClient(URL_BASE, ANON);

/**
 * Cada cuenta tiene su propia clave, nunca una compartida: hacen falta la de
 * Federico (admin) y la de Claudia (empleada) por separado para comparar lo
 * que ve alguien de adentro y, más abajo, probar si una empleada escala a
 * administradora.
 */
const CLAVE_FEDERICO = process.argv[2] ?? env("CLAVE_DEV_FEDERICO");
const CLAVE_CLAUDIA = process.argv[3] ?? env("CLAVE_DEV_CLAUDIA");

let graves = 0;
let leves = 0;

function bien(que: string) {
  console.log(`  OK    ${que}`);
}
function mal(que: string, detalle = "") {
  console.log(`  GRAVE ${que}${detalle ? ` → ${detalle}` : ""}`);
  graves++;
}
function ojo(que: string, detalle = "") {
  console.log(`  OJO   ${que}${detalle ? ` → ${detalle}` : ""}`);
  leves++;
}

async function main() {
  console.log("\n1. ¿Puede alguien crearse una cuenta solo?");
  console.log("   (si puede, RLS le da acceso a TODA la base: es el peor agujero posible)");
  const alta = await intruso.auth.signUp({
    email: `intruso-${Date.now()}@ejemplo.com`,
    password: "unaClaveCualquiera123",
  });
  if (alta.error) {
    bien(`el registro está cerrado (${alta.error.message})`);
  } else if (alta.data.session) {
    mal("cualquiera se crea una cuenta Y queda con sesión activa");
  } else {
    ojo(
      "el registro crea el usuario pero sin sesión (pide confirmar mail)",
      "conviene cerrarlo del todo igual",
    );
  }

  console.log("\n2. Sin sesión, ¿qué se puede leer?");
  const tablas = [
    "productos",
    "clientes",
    "cliente_direcciones",
    "remitos",
    "remito_lineas",
    "movimientos",
    "ingresos",
    "devoluciones",
    "perfiles",
    "precios_historial",
  ];
  // El criterio acá tiene trampa por los dos lados. Una política de seguridad
  // no rechaza la consulta: la deja pasar y devuelve cero filas. Entonces "vino
  // vacío" puede significar "está protegida" o "la tabla está vacía", y eso
  // último parecería seguro hasta el día que tenga datos.
  //
  // Lo único que prueba algo es comparar: cuántas filas ve alguien del equipo
  // contra cuántas ve un desconocido. Si adentro hay datos y afuera se ven
  // cero, está cerrada de verdad.
  const empleado = createClient(URL_BASE, ANON);
  await empleado.auth.signInWithPassword({
    email: "federico@barba.local",
    password: CLAVE_FEDERICO,
  });

  for (const t of tablas) {
    const adentro = await empleado
      .from(t)
      .select("*", { count: "exact", head: true });
    const afuera = await intruso
      .from(t)
      .select("*", { count: "exact", head: true });

    const hay = adentro.count ?? 0;
    const filtra = (afuera.count ?? 0) === 0 || afuera.error !== null;

    if (!filtra) mal(`${t}: SE LEE sin estar logueado`, `${afuera.count} filas`);
    else if (hay === 0) ojo(`${t}: está vacía, la prueba no dice nada`);
    else bien(`${t}: ${hay} filas adentro, 0 afuera`);
  }
  await empleado.auth.signOut();

  console.log("\n3. Las vistas de stock (no heredan las políticas de las tablas)");
  for (const v of ["stock_fisico", "stock_a_pedir"]) {
    const { error } = await intruso.from(v).select("*").limit(1);
    if (error) bien(`${v}: rechaza la consulta`);
    else
      mal(
        `${v}: SE LEE sin estar logueado`,
        "una vista corre con los permisos de quien la creó",
      );
  }

  console.log("\n4. Sin sesión, ¿se puede escribir?");
  const escritura = await intruso
    .from("productos")
    .insert({ codigo: `HACK-${Date.now()}`, nombre: "entré" });
  if (escritura.error) bien("no puede insertar productos");
  else mal("PUEDE insertar productos sin cuenta");

  console.log("\n5. Sin sesión, ¿puede ejecutar las funciones de stock?");
  const falso = "00000000-0000-0000-0000-000000000000";
  for (const fn of ["emitir_remito", "anular_remito"]) {
    const { error } = await intruso.rpc(fn, {
      p_remito_id: falso,
      ...(fn === "anular_remito" ? { p_motivo: "x" } : {}),
    });
    // "El remito no existe" = la función CORRIÓ. Que no exista es suerte, no seguridad.
    if (error && /permission|denied|not find|schema cache/i.test(error.message)) {
      bien(`${fn}: no puede ni llamarla`);
    } else {
      mal(
        `${fn}: la ejecuta un desconocido`,
        error ? error.message.slice(0, 60) : "corrió sin error",
      );
    }
  }

  const ajuste = await intruso.rpc("ajustar_stock", {
    p_producto_id: falso,
    p_unidades_contadas: 99999,
    p_nota: "hola",
  });
  if (
    ajuste.error &&
    /permission|denied|not find|schema cache/i.test(ajuste.error.message)
  ) {
    bien("ajustar_stock: no puede ni llamarla");
  } else {
    mal(
      "ajustar_stock: la ejecuta un desconocido",
      ajuste.error ? ajuste.error.message.slice(0, 60) : "corrió sin error",
    );
  }

  console.log("\n6. Fuerza bruta contra el login");
  const inicio = Date.now();
  let rechazos = 0;
  let frenado = false;
  for (let i = 0; i < 6; i++) {
    const { error } = await intruso.auth.signInWithPassword({
      email: "federico@barba.local",
      password: `intento-${i}`,
    });
    if (error?.message.match(/rate|many|limit/i)) {
      frenado = true;
      break;
    }
    if (error) rechazos++;
  }
  if (frenado) bien("corta los intentos seguidos");
  else
    ojo(
      `aceptó ${rechazos} intentos seguidos en ${Math.round((Date.now() - inicio) / 1000)}s`,
      "con claves cortas, alguien puede probar de a miles",
    );

  console.log("\n7. Cabeceras del sitio publicado");
  const res = await fetch("https://barba-remitos.vercel.app", {
    redirect: "manual",
  });
  const esperadas: Record<string, string> = {
    "x-frame-options": "evita que metan el sitio en un iframe ajeno",
    "x-content-type-options": "evita que el navegador adivine tipos de archivo",
    "referrer-policy": "evita filtrar a dónde navega la gente",
    "strict-transport-security": "obliga a usar HTTPS siempre",
  };
  for (const [h, para] of Object.entries(esperadas)) {
    if (res.headers.get(h)) bien(`${h}: puesta`);
    else ojo(`falta ${h}`, para);
  }

  console.log("\n8. Una empleada, ¿puede hacerse administradora?");
  console.log("   (el panel con la facturación es solo de Federico: migración 0006)");
  {
    const empleada = createClient(URL_BASE, ANON);
    const login = await empleada.auth.signInWithPassword({
      email: "claudia@barba.local",
      password: CLAVE_CLAUDIA,
    });
    if (login.error) {
      ojo("no se pudo entrar como claudia", login.error.message);
    } else {
      const uid = login.data.user.id;

      const propio = await empleada
        .from("perfiles")
        .select("es_admin")
        .eq("id", uid)
        .single();
      if (propio.data?.es_admin === false) bien("su perfil dice que no es admin");
      else mal("el perfil de la empleada vino marcado como admin");

      const ascenso = await empleada
        .from("perfiles")
        .update({ es_admin: true })
        .eq("id", uid)
        .select();
      const cambiadas = ascenso.data?.length ?? 0;
      if (ascenso.error || cambiadas === 0) {
        bien("no puede marcarse admin a sí misma");
      } else {
        mal("una empleada se puede hacer administradora sola");
        // Dejar la base como estaba, pase lo que pase con la prueba.
        await empleada.from("perfiles").update({ es_admin: false }).eq("id", uid);
      }

      const aFederico = await empleada
        .from("perfiles")
        .update({ nombre: "tocado" })
        .neq("id", uid)
        .select();
      if (aFederico.error || (aFederico.data?.length ?? 0) === 0) {
        bien("tampoco puede editar el perfil de otro");
      } else {
        mal("una empleada puede editar el perfil de otra persona");
      }

      await empleada.auth.signOut();
    }
  }

  console.log();
  console.log(`${graves} problema(s) grave(s) · ${leves} para mejorar`);
  if (graves) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR:", String(e));
  process.exit(1);
});
