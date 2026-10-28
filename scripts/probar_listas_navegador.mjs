/**
 * Recorre las pantallas de la v2.0 (listas y costos) como Claudia SIN GUARDAR
 * NADA: no emite, no guarda ingresos, no aplica precios. Para ver el selector
 * de listas y el costo sin tocar la base, intercepta las respuestas y le pone
 * a un producto un precio de oferta y un último costo de mentira, solo en esta
 * pestaña.
 *
 *   node scripts/probar_listas_navegador.mjs [url] [codigo]
 *
 * Capturas en scripts/capturas/v2-*.png
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import * as XLSX from "xlsx";

const BASE = process.argv[2] ?? "http://localhost:3007";
const CODIGO = process.argv[3] ?? "W014";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SALIDA = new URL("./capturas/", import.meta.url);
mkdirSync(SALIDA, { recursive: true });

function clave(usuario) {
  const v = `CLAVE_DEV_${usuario.toUpperCase()}`;
  const l = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((x) => x.startsWith(`${v}=`));
  if (!l) throw new Error(`Falta ${v}`);
  return l.slice(v.length + 1).trim();
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const chequear = (texto, cond, detalle = "") => {
  console.log(`  ${cond ? "OK " : "MAL"}  ${texto}${cond ? "" : ` → ${detalle}`}`);
  if (!cond) fallas++;
};

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900 });
const errores = [];
pagina.on("pageerror", (e) => errores.push(String(e)));
pagina.on("console", (m) => m.type() === "error" && errores.push(m.text()));

// Escrituras: ninguna. Si la app intenta escribir, se corta y se avisa.
const escrituras = [];
let idProducto = null;
await pagina.setRequestInterception(true);
pagina.on("request", async (req) => {
  const url = req.url();
  if (!url.includes("/rest/v1/")) return req.continue();
  // OPTIONS es el permiso previo del navegador (CORS), no escribe nada.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
    escrituras.push(`${req.method()} ${url}`);
    return req.abort();
  }
  if (req.method() === "GET" && (url.includes("/rest/v1/productos") || url.includes("/rest/v1/ultimo_costo"))) {
    const r = await fetch(url, { headers: req.headers() });
    let cuerpo = await r.json();
    if (url.includes("/productos")) {
      for (const p of cuerpo)
        if (p.codigo === CODIGO) {
          idProducto = p.id;
          p.precio_oferta = Math.round(Number(p.precio_lista) * 0.9);
        }
    } else if (!url.includes("offset=1000")) {
      // Productos y costos se piden a la vez: se espera a saber el id.
      for (let i = 0; i < 100 && !idProducto; i++) await espera(100);
      cuerpo = [...cuerpo, { producto_id: idProducto, costo_unitario: 70000 / 6, fecha: "2026-10-27T15:00:00Z", proveedor: "PRUEBA" }];
    }
    return req.respond({
      status: r.status,
      contentType: "application/json",
      headers: {
        "content-range": r.headers.get("content-range") ?? "",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
      },
      body: JSON.stringify(cuerpo),
    });
  }
  req.continue();
});

const texto = () => pagina.evaluate(() => document.body.innerText);
const captura = (n) => pagina.screenshot({ path: new URL(`v2-${n}.png`, SALIDA).pathname.slice(1), fullPage: true });
const clicTexto = (t) =>
  pagina.evaluate((t) => {
    const b = [...document.querySelectorAll("button, a, summary")].find((x) => x.textContent.trim().startsWith(t));
    if (!b) return false;
    b.click();
    return true;
  }, t);

try {
  await pagina.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await pagina.waitForSelector("#usuario", { timeout: 30000 });
  await pagina.type("#usuario", "claudia");
  await pagina.type("#clave", clave("claudia"));
  await Promise.all([pagina.click('button[type="submit"]'), pagina.waitForSelector("nav a", { timeout: 30000 })]);
  await espera(4000);
  chequear("entra Claudia y carga sin error de datos", !(await texto()).includes("No se pudieron traer"), "cartel de error de carga");
  chequear("versión 2.0 en el menú", (await texto()).includes("2.0"));

  console.log("\nNuevo remito");
  await pagina.goto(`${BASE}/remitos/nuevo`, { waitUntil: "networkidle0" });
  await espera(3000);
  const buscador = 'input[placeholder^="Buscar por código o nombre"]';
  await pagina.type(buscador, CODIGO);
  await pagina.keyboard.press("Enter");
  await espera(500);
  let t = await texto();
  chequear("aparecen los dos precios Oficial y Oferta", /Oficial\s*\$/.test(t) && /Oferta\s*\$/.test(t), t.slice(0, 300));
  chequear("aparece el costo en gris", t.includes("costo $ 11.667") || /costo \$\s?11\.667/.test(t), "no aparece «costo $11.667»");
  await clicTexto("Oferta");
  await espera(300);
  const precio = await pagina.$eval("tbody input[type=number]:not([aria-label])", (i) => i.value).catch(() => "");
  chequear("elegir Oferta pone el precio de oferta", precio !== "", `precio ${precio}`);
  await clicTexto("+ parte en oficial");
  await espera(300);
  const lineas = await pagina.evaluate(() => document.querySelectorAll('button[aria-label="Quitar"]').length);
  chequear("«+ parte en oficial» agrega otra línea del mismo producto", lineas === 2, `${lineas} líneas`);
  chequear("no ofrece partir de nuevo", !(await texto()).includes("+ parte en"), "sigue el botón");
  // Otro producto sin oferta: sin selector
  await pagina.type(buscador, "malbec");
  await pagina.keyboard.press("Enter");
  await espera(300);
  chequear("un producto sin oferta no muestra selector", (await pagina.evaluate(() => document.querySelectorAll('button[aria-label="Quitar"]').length)) === 3 &&
    (await pagina.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.startsWith("Oficial")).length)) === 2);
  await captura("remito");

  console.log("\nIngresos");
  await pagina.goto(`${BASE}/ingresos`, { waitUntil: "networkidle0" });
  await espera(2500);
  await pagina.type('input[placeholder^="Buscar por código o nombre"]', CODIGO);
  await pagina.keyboard.press("Enter");
  await espera(300);
  chequear("columna «Costo x caja»", (await texto()).includes("COSTO X CAJA") || (await texto()).includes("Costo x caja"));
  await pagina.type('input[aria-label="Costo por caja"]', "70000");
  await captura("ingreso");
  const corregir = await clicTexto("Corregir");
  await espera(300);
  chequear("«Corregir» de un ingreso anterior muestra el costo por línea", corregir && (await pagina.$$('li input[aria-label="Costo por caja"]')).length > 0);
  await captura("ingreso-corregir");

  console.log("\nProductos");
  await pagina.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await espera(3000);
  t = await texto();
  chequear("columnas Oficial / Oferta / Últ. costo", /OFERTA X U/i.test(t) && /LT\. COSTO X U/i.test(t), t.slice(0, 400));
  await clicTexto("Solo en oferta");
  await pagina.click('input[type="checkbox"]');
  await espera(500);
  const enOferta = await pagina.evaluate(() => document.querySelectorAll("tbody tr").length);
  chequear("filtro «Solo en oferta» deja 1", enOferta === 1, `${enOferta} filas`);
  await captura("productos");
  await clicTexto("Historial");
  await espera(2500);
  t = await texto();
  chequear("Historial abre con Compras y Movimientos", t.includes("Compras") && t.includes("Movimientos"));
  await captura("historial");

  console.log("\nActualizar precios");
  await pagina.goto(`${BASE}/productos/precios`, { waitUntil: "networkidle0" });
  await espera(2500);
  // Un Excel con el formato de Fede: W014 sube 10 %, uno sin código, y una hoja de cavas
  const filas = [["", "CODIGO", "BODEGA", "Producto", "U", "Presentación", "Precio unitario", "Precio Sugerido"],
    ["", CODIGO, "", "", 6, "", 30442, 0], ["", "ZZZ999", "X", "No existe", 6, "", 1000, 0]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), "LISTA");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cava", "Precio"]]), "CAVAS");
  const ruta = new URL("v2-lista-prueba.xlsx", SALIDA).pathname.slice(1);
  writeFileSync(ruta, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const input = await pagina.$('input[type="file"]');
  await input.uploadFile(ruta);
  await espera(3000);
  t = await texto();
  chequear("lee la hoja LISTA y saltea CAVAS", t.includes("leí LISTA") && t.includes("salteé CAVAS"), t.slice(0, 500));
  chequear("vista previa: 1 sube y 1 no encontrado", /Suben \(1\)/.test(t) && /No encontrados \(1\)/.test(t));
  chequear("botón «Aplicar» con 1 cambio (no se toca)", t.includes("Se van a cambiar 1 precios"));
  await captura("precios");
  await clicTexto("Lista de oferta");
  await espera(300);
  chequear("pestaña de oferta ofrece bajar la planilla", (await texto()).includes("Bajar planilla de oferta"));
} catch (e) {
  console.error(e);
  fallas++;
} finally {
  const reales = errores.filter((e) => !/Failed to load resource.*(favicon|net::ERR_FAILED)/.test(e));
  chequear("sin errores en la consola", reales.length === 0, reales.slice(0, 5).join(" | "));
  chequear("no intentó escribir en la base", escrituras.length === 0, escrituras.join(" | "));
  await navegador.close();
  console.log(fallas ? `\n${fallas} fallas` : "\nTodo bien");
  process.exit(fallas ? 1 : 0);
}
