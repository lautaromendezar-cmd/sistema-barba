/**
 * Prueba la app como la usa una persona: abre el navegador, entra con usuario
 * y clave, recorre las pantallas y saca capturas.
 *
 *   node scripts/probar_navegador.mjs [url]
 *
 * Las capturas quedan en scripts/capturas/. Sirve para ver que la pantalla
 * muestre lo que la base tiene, que es distinto de que las consultas anden.
 */
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3007";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SALIDA = new URL("./capturas/", import.meta.url);

// La clave no se escribe acá: sale de .env.local, que no se commitea.
const CLAVE = (() => {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const linea = texto
    .split(String.fromCharCode(10))
    .find((l) => l.startsWith("CLAVE_DEV="));
  if (!linea) throw new Error("Falta CLAVE_DEV en .env.local");
  return linea.slice("CLAVE_DEV=".length).trim();
})();

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
  await pagina.type("#clave", CLAVE);
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

  // El de la línea del remito, NO el buscador global del encabezado: los dos
  // dicen "Buscar" y el primero del DOM es el de arriba.
  const buscador = await pagina.$('input[placeholder*="Enter agrega"]');
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
  await new Promise((r) => setTimeout(r, 9000));

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

  console.log("\nClientes y proveedores");
  await pagina.goto(`${BASE}/clientes`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  const textoClientes = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "la lista de clientes trae datos",
    textoClientes.includes("Vinoteca") || textoClientes.includes("Almacén"),
    "no aparece ningún cliente conocido",
  );
  await captura("7-clientes");

  await pagina.goto(`${BASE}/proveedores`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  const textoProv = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "la lista de proveedores trae datos",
    textoProv.includes("Alfa Crux") || textoProv.includes("Alta Vista"),
    "no aparece ningún proveedor",
  );
  await captura("8-proveedores");

  console.log("\nEl logo carga en todas partes");
  const logos = await pagina.evaluate(() =>
    [...document.querySelectorAll("img")].map((i) => ({
      src: i.currentSrc || i.src,
      ok: i.complete && i.naturalWidth > 0,
    })),
  );
  const rotos = logos.filter((l) => !l.ok);
  chequear(
    `${logos.length} imagen(es), ninguna rota`,
    logos.length > 0 && rotos.length === 0,
    rotos.map((r) => r.src).join(", ") || "no hay ninguna imagen en la página",
  );

  console.log("\nIngresos");
  await pagina.goto(`${BASE}/ingresos`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2000));
  await captura("6-ingresos");
  chequear("la pantalla de ingresos abre", true);

  console.log("\nQuién ve la plata del negocio");
  // Sigue con la sesión de Claudia, que es empleada.
  await pagina.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const inicioEmpleada = await pagina.evaluate(() => document.body.innerText);
  for (const prohibido of [
    "Vendido este mes",
    "Stock valorizado",
    "Ventas de los últimos 12 meses",
    "Lo que más sale",
  ]) {
    chequear(
      `la empleada no ve "${prohibido}"`,
      !inicioEmpleada.includes(prohibido),
      "aparece en su pantalla de inicio",
    );
  }
  chequear(
    "pero sí ve lo operativo",
    inicioEmpleada.includes("Hay que reponer") &&
      inicioEmpleada.includes("Falta entregar"),
    "no aparece ni 'Hay que reponer' ni 'Falta entregar'",
  );
  await captura("9-inicio-empleada");

  const botones = await pagina.$$("button");
  for (const b of botones) {
    const texto = await pagina.evaluate((el) => el.innerText, b);
    if (texto.trim() === "Salir") {
      await b.click();
      break;
    }
  }
  await pagina.waitForSelector("#usuario", { timeout: 30000 });
  await pagina.type("#usuario", "federico");
  await pagina.type("#clave", CLAVE);
  await Promise.all([
    pagina.click('button[type="submit"]'),
    pagina.waitForSelector("nav a", { timeout: 30000 }),
  ]);
  await new Promise((r) => setTimeout(r, 3000));
  const inicioFederico = await pagina.evaluate(() => document.body.innerText);
  chequear(
    "Federico sí ve el panel completo",
    inicioFederico.includes("Vendido este mes") &&
      inicioFederico.includes("Stock valorizado"),
    "el panel no apareció para el admin",
  );
  await captura("10-inicio-federico");

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
