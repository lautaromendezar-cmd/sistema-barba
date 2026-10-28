/**
 * Prueba la lectura de listas (lib/listas.ts) con un Excel armado igual al de
 * Federico, sin navegador ni base: npx tsx scripts/probar_listas.ts
 *
 * Cuando lleguen las listas reales, se puede pasar una como argumento para ver
 * el resumen contra el catálogo de producción (solo lee):
 *   npx tsx scripts/probar_listas.ts "datos/listas 28-oct/Lista ... .xlsx"
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { aAplicar, comparar, hojasDe, leerOferta, leerOficial, planillaDeOferta } from "../lib/listas";
import type { Producto } from "../lib/types";

let fallas = 0;
function ok(cond: boolean, texto: string) {
  console.log(`  ${cond ? "OK " : "MAL"}  ${texto}`);
  if (!cond) fallas++;
}

const prod = (codigo: string, bodega: string, nombre: string, precioLista: number, extra: Partial<Producto> = {}): Producto => ({
  codigo, bodega, nombre, precioLista, seccion: "Vinos", presentacion: "Caja x 6", unidadesPorBulto: 6, enListaActual: true, ...extra,
});

const catalogo: Producto[] = [
  prod("W001", "Alfa Crux", "Malbec", 12000),
  prod("W002", "Alfa Crux", "Blend", 15000),
  prod("W003", "Rutini", "Cabernet", 20000, { precioOferta: 18000 }),
  prod("W011", "Rolland", "Val de Flores", 51967),
  prod("W020", "Nicasia", "Viognier", 0, { precioAConsultar: true }),
  prod("W900", "Gran Bodega", "Gran Corte", 150000),
  prod("W901", "Catena", "Malbec Argentino", 30000), // sin código en el Excel
];

function libro(hojas: Record<string, unknown[][]>) {
  const wb = XLSX.utils.book_new();
  for (const [n, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), n);
  return hojasDe(XLSX.utils)(XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" }));
}

console.log("Lista oficial");
const oficial = libro({
  LISTA: [
    ["", "LISTA GRUPO BARBA OCTUBRE 2026"],
    [],
    ["", "CODIGO", "BODEGA", "Producto", "U", "Presentación", "Precio unitario", "Precio Sugerido"],
    ["", "", "ALFA CRUX", "", "", "", "", ""],                         // título de bodega
    ["", "W001", "Alfa Crux", "Malbec", 6, "750cc", 12800, 16000],     // sube
    ["", "W002", "Alfa Crux", "Blend", 6, "750cc", 15000, 19000],      // igual
    ["", "W003", "Rutini", "Cabernet", 6, "750cc", 19000, 23000],      // baja
    ["", "W011", "Rolland", "Val de Flores", 6, "750cc", 103935, 0],   // salto
    ["", "W020", "Nicasia", "Viognier", 6, "750cc", 9000, 0],          // tenía consultar
    ["", "W900", "Gran Bodega", "Gran Corte", 6, "750cc", "Consultar", ""], // consultar con precio
    ["", "", "Catena", "Malbec  Argentino", 6, "750cc", "$ 31.500", ""], // sin código, por nombre, texto
    ["", "W777", "Otra", "No existe", 6, "750cc", 5000, ""],            // no encontrado
  ],
  "IMPORTADOS Y WHISKY'S": [
    ["CODIGO", "BODEGA", "Producto", "U", "Presentación", "Precio unitario"],
    ["W001", "Alfa Crux", "Malbec", 6, "750cc", 12900],                 // repetido con otro precio
  ],
  CAVAS: [["Modelo", "Botellas", "Precio"], ["Cava 12", 12, 400000]],
});
const lo = leerOficial(oficial, catalogo);
ok(lo.hojasLeidas.length === 2 && lo.hojasSalteadas.join() === "CAVAS", `hojas: leídas ${lo.hojasLeidas.join(" / ")}, salteadas ${lo.hojasSalteadas.join()}`);
const co = comparar("oficial", lo.renglones);
ok(co.repetidos.length === 2, "W001 repetido con dos precios queda afuera");
ok(co.iguales === 1, "W002 igual");
ok(co.bajan.map((c) => c.producto.codigo).join() === "W003", "W003 baja");
ok(co.suben.map((c) => c.producto.codigo).sort().join() === "W011,W901", "W011 y W901 suben");
ok(co.suben.find((c) => c.producto.codigo === "W901")?.renglon.por === "nombre", "W901 encontrado por bodega + nombre, precio en texto");
ok(co.suben.find((c) => c.producto.codigo === "W901")?.despues === 31500, "«$ 31.500» se lee como 31500");
ok(co.aRevisar.map((c) => c.producto.codigo).join() === "W011", "W011 (+100 %) para revisar");
ok(co.nuevos.map((c) => c.producto.codigo).join() === "W020", "W020 tenía «a consultar»");
ok(co.consultar.map((r) => r.producto?.codigo).join() === "W900", "W900 dice Consultar: no se toca");
ok(co.noEncontrados.map((r) => r.codigoExcel).join() === "W777", "W777 no encontrado");
const sinTildar = aAplicar(co, new Set());
ok(sinTildar.map((x) => x.codigo).sort().join() === "W003,W020,W901", `sin tildar se aplican ${sinTildar.length}`);
ok(aAplicar(co, new Set(["W011"])).length === 4, "tildando W011 se aplican 4");

console.log("Lista de oferta");
const plantilla = planillaDeOferta(catalogo);
ok(plantilla.length === catalogo.length + 1, "la planilla trae todo el catálogo");
const filaDe = (c: string) => plantilla.findIndex((f) => f[0] === c);
plantilla[filaDe("W001")][5] = 10980;   // entra
plantilla[filaDe("W003")][5] = "";      // sale
plantilla[filaDe("W002")][5] = 16000;   // más cara que la oficial
plantilla[filaDe("W011")][5] = 20000;   // menos de la mitad de la oficial
const oferta = libro({ Oferta: plantilla });
const cf = comparar("oferta", leerOferta(oferta, catalogo).renglones);
ok(cf.nuevos.map((c) => c.producto.codigo).sort().join() === "W001,W002,W011", "W001, W002 y W011 entran");
ok(cf.salen.map((c) => c.producto.codigo).join() === "W003", "W003 sale");
ok(cf.aRevisar.map((c) => c.producto.codigo).sort().join() === "W002,W011", "W002 (más cara) y W011 (menos de la mitad) para revisar");
ok(cf.iguales === catalogo.length - 4, "el resto queda igual");
ok(JSON.stringify(aAplicar(cf, new Set())) === JSON.stringify([{ codigo: "W001", precio: 10980 }, { codigo: "W003", precio: null }]), "se aplican W001 y la salida de W003");
ok(leerOficial(oferta, catalogo).hojasLeidas.length === 0, "la planilla de oferta no pasa como oficial");
ok(leerOferta(oficial, catalogo).hojasLeidas.length === 0, "la oficial no pasa como oferta");

// Con un archivo real: solo el resumen contra el catálogo de producción.
// SOLO LEE: entra como federico y no escribe nada.
function env(clave: string): string {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith(`${clave}=`))
      return linea.slice(clave.length + 1).replace(/^"|"$/g, "");
  }
  throw new Error(`Falta ${clave} en .env.local`);
}

async function contraElCatalogo(ruta: string) {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "federico@barba.local",
    password: env("CLAVE_DEV_FEDERICO"),
  });
  if (error) throw new Error(`No pude entrar como federico: ${error.message}`);
  await new Promise((r) => setTimeout(r, 3000)); // «JWT issued at future»

  const filas: Record<string, unknown>[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error: e } = await sb.from("productos").select("*").order("codigo").range(d, d + 999);
    if (e) throw e;
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  await sb.auth.signOut();

  const cat: Producto[] = filas.map((p) =>
    prod(p.codigo as string, (p.bodega as string) ?? "", p.nombre as string, Number(p.precio_lista), {
      precioAConsultar: p.precio_a_consultar as boolean,
      precioOferta: p.precio_oferta == null ? null : Number(p.precio_oferta),
      unidadesPorBulto: p.unidades_por_bulto as number,
    }),
  );
  const hojas = hojasDe(XLSX.utils)(XLSX.read(readFileSync(ruta), { type: "buffer" }));
  const esOferta = leerOficial(hojas, cat).hojasLeidas.length === 0;
  const leido = esOferta ? leerOferta(hojas, cat) : leerOficial(hojas, cat);
  const c = comparar(esOferta ? "oferta" : "oficial", leido.renglones);
  console.log(`\n${ruta} (${c.lista}, ${cat.length} productos en el sistema)`);
  console.log(`  hojas leídas: ${leido.hojasLeidas.join(" / ")} · salteadas: ${leido.hojasSalteadas.join(" / ")}`);
  console.log(`  renglones con precio: ${leido.renglones.length} · encontrados por nombre: ${leido.renglones.filter((r) => r.por === "nombre").length}`);
  console.log(`  suben ${c.suben.length} · bajan ${c.bajan.length} · nuevos ${c.nuevos.length} · salen ${c.salen.length} · iguales ${c.iguales}`);
  console.log(`  a revisar ${c.aRevisar.length} · consultar ${c.consultar.length} · repetidos ${c.repetidos.length} · no encontrados ${c.noEncontrados.length}`);
}

const real = process.argv[2];
(real ? contraElCatalogo(real) : Promise.resolve())
  .then(() => {
    console.log(fallas ? `\n${fallas} pruebas fallaron` : "\nTodo bien");
    process.exit(fallas ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
