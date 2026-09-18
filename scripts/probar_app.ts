/**
 * Prueba de punta a punta contra la base real, con sesion de usuario.
 *
 *   npx tsx scripts/probar_app.ts
 *
 * Hace lo mismo que hace la app desde el navegador: entra con usuario y clave,
 * arma un remito, lo emite, revisa el stock, lo anula. Si las politicas de
 * seguridad estuvieran mal, esto falla igual que fallaria la app, que es
 * justamente lo que se quiere probar.
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

let fallos = 0;
function chequear(descripcion: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  console.log(`  ${ok ? "OK  " : "MAL "} ${descripcion}` + (ok ? "" : ` → esperaba ${esperado}, vino ${obtenido}`));
  if (!ok) fallos++;
}

async function stockDe(productoId: string): Promise<number> {
  const { data } = await supabase
    .from("stock_fisico")
    .select("unidades")
    .eq("producto_id", productoId)
    .single();
  return data?.unidades ?? 0;
}

async function main() {
  console.log("\nSin sesion no se ve nada");
  const anonimo = await supabase.from("productos").select("codigo");
  chequear("un desconocido no lee productos", anonimo.data?.length ?? 0, 0);

  console.log("\nLogin");
  const login = await supabase.auth.signInWithPassword({
    email: "claudia@barba.local",
    password: "barba2026",
  });
  chequear("claudia entra con su clave", login.error, null);

  const malaClave = await createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  ).auth.signInWithPassword({ email: "claudia@barba.local", password: "otra" });
  chequear("con la clave mal no entra", malaClave.error !== null, true);

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", login.data.user!.id)
    .single();
  chequear("tiene perfil con nombre", perfil?.nombre, "Claudia");

  console.log("\nDatos cargados");
  const { data: productos } = await supabase.from("productos").select("*").order("codigo");
  chequear("ve los 12 productos", productos?.length, 12);
  const prod = productos![0];
  const upb = prod.unidades_por_bulto;

  const { data: clientes } = await supabase.from("clientes").select("*").limit(1);
  const cliente = clientes![0];

  const stockInicial = await stockDe(prod.id);
  console.log(`  (${prod.codigo} arranca en ${stockInicial} unidades)`);

  console.log("\nIngreso de mercaderia: 5 bultos");
  const { data: ingreso } = await supabase
    .from("ingresos")
    .insert({ bodega: prod.bodega, nro_remito_proveedor: "PRUEBA-1" })
    .select()
    .single();
  await supabase.from("ingreso_lineas").insert({
    ingreso_id: ingreso!.id,
    producto_id: prod.id,
    cantidad_bultos: 5,
    unidades_por_bulto: upb,
  });
  chequear(`suma ${5 * upb} unidades`, await stockDe(prod.id), stockInicial + 5 * upb);

  console.log("\nRemito: 2 bultos entregados + 1 pendiente");
  const { data: remito } = await supabase
    .from("remitos")
    .insert({
      cliente_id: cliente.id,
      descuento_pct: cliente.descuento_pct,
      ajuste_pct: 10.5,
      notas: "Prueba automatica",
      usuario_id: login.data.user!.id,
    })
    .select()
    .single();

  await supabase.from("remito_lineas").insert([
    {
      remito_id: remito!.id,
      producto_id: prod.id,
      cantidad_bultos: 2,
      unidades_por_bulto: upb,
      precio_unitario: prod.precio_lista,
      entregado: true,
    },
    {
      remito_id: remito!.id,
      producto_id: prod.id,
      cantidad_bultos: 1,
      unidades_por_bulto: upb,
      precio_unitario: prod.precio_lista,
      entregado: false,
    },
  ]);

  chequear("el borrador no descuenta", await stockDe(prod.id), stockInicial + 5 * upb);

  console.log("\nEmitir");
  const { data: emitido, error: errorEmitir } = await supabase
    .rpc("emitir_remito", { p_remito_id: remito!.id })
    .single<{ numero: number; estado: string }>();
  chequear("emite sin error", errorEmitir, null);
  chequear("queda emitido", emitido?.estado, "emitido");
  chequear("tiene numero", typeof emitido?.numero === "number", true);
  chequear(
    `descuenta solo lo entregado (${2 * upb})`,
    await stockDe(prod.id),
    stockInicial + 3 * upb,
  );

  const { data: aPedir } = await supabase
    .from("stock_a_pedir")
    .select("unidades")
    .eq("producto_id", prod.id)
    .single();
  chequear(`deja ${upb} para pedirle al proveedor`, aPedir?.unidades, upb);

  console.log("\nAnular");
  const { error: errorAnular } = await supabase.rpc("anular_remito", {
    p_remito_id: remito!.id,
    p_motivo: "prueba automatica",
  });
  chequear("anula sin error", errorAnular, null);
  chequear("devuelve el stock", await stockDe(prod.id), stockInicial + 5 * upb);

  console.log("\nAjuste manual");
  await supabase.rpc("ajustar_stock", {
    p_producto_id: prod.id,
    p_unidades_contadas: 100,
    p_nota: "prueba automatica",
    p_tipo: "ajuste",
  });
  chequear("deja el stock en lo contado", await stockDe(prod.id), 100);

  console.log("\nLimpieza");
  await supabase.rpc("ajustar_stock", {
    p_producto_id: prod.id,
    p_unidades_contadas: stockInicial,
    p_nota: "fin de la prueba",
    p_tipo: "ajuste",
  });
  chequear("el stock vuelve a donde estaba", await stockDe(prod.id), stockInicial);

  await supabase.auth.signOut();
  const despues = await supabase.from("productos").select("codigo");
  chequear("al salir deja de ver los datos", despues.data?.length ?? 0, 0);

  console.log();
  if (fallos) {
    console.log(`${fallos} chequeo(s) fallaron.`);
    process.exit(1);
  }
  console.log("Todo OK.");
}

main().catch((e) => {
  console.error("ERROR:", String(e));
  process.exit(1);
});
