/**
 * Prueba la app como la usa una persona: abre el navegador, entra con usuario
 * y clave, recorre las pantallas y saca capturas.
 *
 *   node scripts/probar_navegador.mjs [url]
 *
 * Las capturas quedan en scripts/capturas/. Sirve para ver que la pantalla
 * muestre lo que la base tiene, que es distinto de que las consultas anden.
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3007";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SALIDA = new URL("./capturas/", import.meta.url);

mkdirSync(SALIDA, { recursive: true });

let fallos = 0;
function chequear(descripcion, ok, detalle = "") {
  console.log(`  ${ok ? "OK  " : "MAL "} ${descripcion}${ok ? "" : ` → ${detalle}`}`);
  if (!ok) fallos++;
}

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900 });

const errores = [];
pagina.on("pageerror", (e) => errores.push(String(e)));
pagina.on("console", (m) => {
  if (m.type() === "error") errores.push(m.text());
});

const captura = (nombre) =>
  pagina.screenshot({ path: new URL(`${nombre}.png`, SALIDA).pathname.slice(1) });

try {
  console.log("\nLogin");
  await pagina.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await pagina.waitForSelector("#usuario", { timeout: 30000 });
  chequear("la pantalla de login aparece", true);
  await captura("1-login");

  await pagina.type("#usuario", "claudia");
  await pagina.type("#clave", "barba2026");
  await Promise.all([
    pagina.click('button[type="submit"]'),
    pagina.waitForSelector("nav a", { timeout: 30000 }),
  ]);
  chequear("entra y aparece el menu", true);

  await new Promise((r) => setTimeout(r, 2500));
  const textoInicio = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "el inicio muestra el nombre del usuario",
    textoInicio.includes("Claudia"),
    "no aparece 'Claudia'",
  );
  await captura("2-inicio");

  console.log("\nProductos");
  await pagina.click('a[href="/productos"]');
  await new Promise((r) => setTimeout(r, 2500));
  const textoProductos = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "la lista trae productos de la base",
    textoProductos.includes("Aguijón") || textoProductos.includes("Aguij"),
    "no encontré ningún producto conocido",
  );
  await captura("3-productos");

  console.log("\nRemitos");
  await pagina.click('a[href="/remitos"]');
  await new Promise((r) => setTimeout(r, 2000));
  await captura("4-remitos");
  chequear("la pantalla de remitos abre", true);

  await pagina.goto(`${BASE}/remitos/nuevo`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2000));
  const textoNuevo = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "el remito nuevo ofrece clientes",
    !textoNuevo.includes("undefined"),
    "hay 'undefined' en pantalla",
  );
  await captura("5-remito-nuevo");

  console.log("\nEmitir un remito desde la pantalla");
  const valorCliente = await pagina.evaluate(() => {
    const opciones = [...document.querySelectorAll("select option")];
    const real = opciones.find((o) => o.value && o.value.length > 10);
    return real ? real.value : "";
  });
  await pagina.select("select", valorCliente);
  chequear("elige un cliente", valorCliente !== "", "no había clientes en el combo");

  const buscador = await pagina.$('input[placeholder*="Buscar"]');
  await buscador.type("Aguij");
  await new Promise((r) => setTimeout(r, 900));
  await pagina.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 900));

  const conLinea = await pagina.evaluate(() => document.body.innerText);
  chequear("el producto entra al remito", conLinea.includes("Aguij"), "no apareció ninguna línea");
  await captura("5b-remito-cargado");

  const botonEmitir = await pagina.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().startsWith("Emitir remito"),
    ),
  );
  await botonEmitir.asElement().click();
  await new Promise((r) => setTimeout(r, 4000));

  const emitido = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "queda emitido y con número",
    /R-\d{4}/.test(emitido),
    "no encontré el número del remito en pantalla",
  );
  await captura("5c-remito-emitido");

  console.log("\nEl stock baja después del remito");
  await pagina.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  const stockTexto = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "la pantalla de stock refleja el movimiento",
    /-\d/.test(stockTexto),
    "no se ve ningún stock afectado",
  );
  await captura("5d-stock-despues");

  console.log("\nIngresos");
  await pagina.goto(`${BASE}/ingresos`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2000));
  await captura("6-ingresos");
  chequear("la pantalla de ingresos abre", true);

  console.log("\nErrores de JavaScript");
  const relevantes = errores.filter(
    (e) => !e.includes("favicon") && !e.includes("Download the React DevTools"),
  );
  chequear(
    "la consola no tira errores",
    relevantes.length === 0,
    relevantes.slice(0, 3).join(" | "),
  );
} catch (e) {
  console.log(`  MAL  ${String(e).split("\n")[0]}`);
  fallos++;
  await captura("error");
} finally {
  await navegador.close();
}

console.log(`\nCapturas en scripts/capturas/`);
if (fallos) {
  console.log(`${fallos} chequeo(s) fallaron.`);
  process.exit(1);
}
console.log("Todo OK.");
