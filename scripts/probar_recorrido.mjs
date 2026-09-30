/**
 * Recorre el sistema como lo haría una persona, con el catálogo real cargado.
 *
 *   node scripts/probar_recorrido.mjs [url]
 *
 * Se diferencia de probar_navegador.mjs en que no mira si las pantallas
 * abren: hace el trabajo de un día. Claudia arma un remito con un producto
 * sin precio y la base la frena, le pone precio, emite, recibe mercadería,
 * corrige el stock, mira el historial, anula. Federico entra después y ve el
 * panel con lo que ella hizo, y le pone precio a un producto "a consultar".
 *
 * Deja la base como la encontró: borra el movimiento que generó y vuelve a
 * marcar como "a consultar" el producto al que le puso precio.
 *
 * Las capturas quedan en scripts/capturas/recorrido-*.png.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3007";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SALIDA = new URL("./capturas/", import.meta.url);

// Productos del catálogo real que se usan como fixtures. Si Federico los
// renombra o los borra, hay que elegir otros.
const CON_PRECIO = { codigo: "W598", nombre: "ALAMOS" }; // Catena, $5.700, caja x6
const SIN_PRECIO = { codigo: "W1338", nombre: "63 GRAN MALBEC" }; // dice "Consultar"
const CLIENTE_DOS_DIRECCIONES = "GUADALUPE";

// Cada cuenta tiene su propia clave (CLAVE_DEV_<USUARIO>), no una compartida.
function leerClave(usuario) {
  const variable = `CLAVE_DEV_${usuario.toUpperCase()}`;
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(`${variable}=`));
  if (!linea) throw new Error(`Falta ${variable} en .env.local`);
  return linea.slice(variable.length + 1).trim();
}

mkdirSync(SALIDA, { recursive: true });

let fallos = 0;
function chequear(descripcion, ok, detalle = "") {
  console.log(`  ${ok ? "OK  " : "MAL "} ${descripcion}${ok ? "" : ` → ${detalle}`}`);
  if (!ok) fallos++;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900 });
pagina.on("dialog", (d) => d.accept());

const errores = [];
pagina.on("pageerror", (e) => errores.push(String(e)));
pagina.on("console", (m) => {
  if (m.type() === "error") errores.push(m.text());
});

const captura = (nombre) =>
  pagina.screenshot({
    path: new URL(`recorrido-${nombre}.png`, SALIDA).pathname.slice(1),
  });

// --- Ayudas que hablan en términos de lo que ve la persona -----------------

const texto = () => pagina.evaluate(() => document.body.innerText);

async function boton(etiqueta, dentroDe = "") {
  const h = await pagina.evaluateHandle(
    (etiqueta, dentroDe) => {
      const raiz = dentroDe
        ? [...document.querySelectorAll("tr, section, form, div")].find((el) =>
            el.innerText?.includes(dentroDe),
          )
        : document;
      return [...(raiz ?? document).querySelectorAll("button")].find((b) =>
        b.textContent.trim().startsWith(etiqueta),
      );
    },
    etiqueta,
    dentroDe,
  );
  if (!h.asElement()) throw new Error(`No encontré el botón "${etiqueta}"${dentroDe ? ` cerca de "${dentroDe}"` : ""}`);
  return h.asElement();
}

/** El botón que está en la MISMA fila de tabla que un texto. */
async function botonEnFila(etiqueta, textoDeLaFila) {
  const h = await pagina.evaluateHandle(
    (etiqueta, textoDeLaFila) => {
      const fila = [...document.querySelectorAll("tbody tr")].find((tr) =>
        tr.innerText.includes(textoDeLaFila),
      );
      return fila
        ? [...fila.querySelectorAll("button")].find((b) =>
            b.textContent.trim().startsWith(etiqueta),
          )
        : null;
    },
    etiqueta,
    textoDeLaFila,
  );
  if (!h.asElement()) throw new Error(`No encontré "${etiqueta}" en la fila de "${textoDeLaFila}"`);
  return h.asElement();
}

const filaDe = (needle) =>
  pagina.evaluate(
    (needle) =>
      [...document.querySelectorAll("tbody tr")].find((tr) => tr.innerText.includes(needle))
        ?.innerText ?? "",
    needle,
  );

// Los inputs de React son controlados: escribir "encima" con triple-clic deja
// restos. Se setea el valor por el setter nativo y se dispara el evento que
// React escucha, que es lo que de verdad hace una tecla.
async function fijarValor(el, valor) {
  await el.evaluate((node, v) => {
    const proto = Object.getPrototypeOf(node);
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(node, v);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(valor));
}

async function escribirEn(selector, valor) {
  const el = await pagina.$(selector);
  if (!el) throw new Error(`No encontré ${selector}`);
  await fijarValor(el, valor);
}

/** El input que sigue a una etiqueta (los formularios usan <label> + <input>). */
async function inputDeEtiqueta(etiqueta) {
  const h = await pagina.evaluateHandle((etiqueta) => {
    const lab = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim().startsWith(etiqueta),
    );
    if (!lab) return null;
    return lab.querySelector("input") ?? lab.nextElementSibling;
  }, etiqueta);
  if (!h.asElement()) throw new Error(`No encontré el campo "${etiqueta}"`);
  return h.asElement();
}

async function entrar(usuario) {
  await pagina.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await pagina.waitForSelector("#usuario", { timeout: 30000 });
  await pagina.type("#usuario", usuario);
  await pagina.type("#clave", leerClave(usuario));
  await Promise.all([
    pagina.click('button[type="submit"]'),
    pagina.waitForSelector("nav a", { timeout: 30000 }),
  ]);
  // Con 4.323 productos la carga inicial tarda un par de segundos.
  await pagina.waitForFunction(
    () => !document.body.innerText.includes("Cargando"),
    { timeout: 60000 },
  );
  await esperar(1500);
}

async function salir() {
  await (await boton("Salir")).click();
  await pagina.waitForSelector("#usuario", { timeout: 30000 });
}

async function ir(ruta) {
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: "networkidle0", timeout: 60000 });
  await esperar(1200);
}

async function agregarProductoAlRemito(codigo) {
  const buscador = await pagina.$('input[placeholder*="Enter agrega"]');
  await buscador.click({ clickCount: 3 });
  await buscador.type(codigo);
  await esperar(700);
  await pagina.keyboard.press("Enter");
  await esperar(500);
}

try {
  // =========================================================================
  console.log("\nClaudia entra");
  await entrar("claudia");
  const inicio = await texto();
  chequear("cae en la pantalla operativa, sin plata", !inicio.includes("Vendido este mes") && inicio.includes("Falta entregar"));
  await captura("01-inicio-claudia");

  // =========================================================================
  console.log("\nEl catálogo real");
  await ir("/productos");
  const cat = await texto();
  chequear("dice cuántos productos hay (4.323)", /4\.?323 productos/.test(cat), "no encontré el total");
  chequear("avisa que muestra 200 y hay más", cat.includes("Se muestran 200 de"), "falta el pie de tabla");
  const filasIniciales = await pagina.evaluate(() => document.querySelectorAll("tbody tr").length);
  chequear("pinta 200 filas, no 4.323", filasIniciales === 200, `pintó ${filasIniciales}`);

  await escribirEn('input[placeholder*="Buscar por código"]', CON_PRECIO.codigo);
  await esperar(600);
  const filaAlamos = await filaDe(CON_PRECIO.codigo);
  chequear(`buscar ${CON_PRECIO.codigo} lo encuentra`, filaAlamos.includes(CON_PRECIO.nombre), filaAlamos || "sin fila");
  chequear("con el precio por unidad y por bulto", filaAlamos.includes("5.700") && filaAlamos.includes("34.200"), filaAlamos);

  await escribirEn('input[placeholder*="Buscar por código"]', SIN_PRECIO.codigo);
  await esperar(600);
  const filaConsultar = await filaDe(SIN_PRECIO.codigo);
  chequear(`${SIN_PRECIO.codigo} sale como "a consultar"`, filaConsultar.includes("a consultar"), filaConsultar || "sin fila");
  await captura("02-catalogo-a-consultar");

  // el filtro por sección
  await escribirEn('input[placeholder*="Buscar por código"]', "");
  await esperar(300);
  await pagina.select("select", "Cervezas y Aguas");
  await esperar(700);
  // Todas las filas que quedan tienen que ser de esa sección: se comprueba
  // mirando la bodega/rubro, que en Cervezas y Aguas es CERVEZAS o AGUA.
  const soloCervezas = await pagina.evaluate(() => {
    const filas = [...document.querySelectorAll("tbody tr")];
    return filas.length > 0 && filas.every((tr) => /CERVEZA|AGUA/i.test(tr.innerText));
  });
  chequear("el filtro por sección deja solo esa sección", soloCervezas, "quedaron filas de otras secciones o ninguna");
  await pagina.select("select", "todas");
  await esperar(400);

  // =========================================================================
  console.log("\nArmar un remito con un producto sin precio");
  await ir("/remitos/nuevo");
  const opciones = await pagina.evaluate(() => document.querySelectorAll("select option").length);
  chequear("el combo de clientes tiene los 587", opciones >= 587, `tiene ${opciones}`);
  const valorCliente = await pagina.evaluate((nombre) => {
    const o = [...document.querySelectorAll("select option")].find((o) => o.textContent.trim().toUpperCase().startsWith(nombre));
    return o ? o.value : "";
  }, CLIENTE_DOS_DIRECCIONES);
  chequear(`elige a ${CLIENTE_DOS_DIRECCIONES}`, valorCliente !== "", "no está en el combo");
  await pagina.select("select", valorCliente);
  await esperar(400);

  await agregarProductoAlRemito(SIN_PRECIO.codigo);
  const conSinPrecio = await texto();
  chequear("la línea entra y avisa que falta el precio", conSinPrecio.includes(SIN_PRECIO.nombre) && conSinPrecio.includes("falta el precio"), "no apareció el aviso");
  await captura("03-remito-falta-precio");

  await (await boton("Emitir remito")).click();
  await esperar(4000);
  const rechazado = await texto();
  chequear("la base lo frena y dice qué producto", rechazado.includes("Falta ponerle precio") && rechazado.includes(SIN_PRECIO.nombre), rechazado.match(/Falta.*|No se pudo.*/)?.[0] ?? "no hubo mensaje");
  chequear("no le dio número", !/R-\d{4}/.test(rechazado), "apareció un número de remito");
  await captura("04-remito-rechazado");

  // Ese rechazo es una excepción de Postgres, que viaja como HTTP 400: es el
  // sistema haciendo bien su trabajo, no un error de la app. Se limpia el
  // registro de errores para que el chequeo final solo cace lo inesperado.
  errores.length = 0;

  // =========================================================================
  console.log("\nLe pone precio y agrega otro producto");
  // el precio de la línea: el último input numérico de la fila del remito
  const inputsPrecio = await pagina.$$('tbody input[type="number"]');
  await fijarValor(inputsPrecio.at(-1), "1000");
  await esperar(300);
  chequear("al escribir el precio el aviso se va", !(await texto()).includes("falta el precio"));

  await agregarProductoAlRemito(CON_PRECIO.codigo);
  const dosLineas = await texto();
  // El precio de cada línea vive en un input numérico, que muestra el número
  // crudo (5700), no formateado. Se comprueba mirando el valor del input.
  const preciosEnLinea = await pagina.$$eval('tbody input[type="number"]', (els) =>
    els.map((e) => e.value),
  );
  chequear(
    "la segunda línea entra con su precio de lista (5700)",
    dosLineas.includes(CON_PRECIO.nombre) && preciosEnLinea.includes("5700"),
    `entró: ${dosLineas.includes(CON_PRECIO.nombre)} · precios en línea: ${preciosEnLinea.join(", ")}`,
  );

  await (await boton("Emitir remito")).click();
  await esperar(6000);
  const emitido = await texto();
  const numero = emitido.match(/R-\d{4}/)?.[0];
  chequear("ahora sí emite y da número", !!numero, "no apareció el número");
  chequear("es el primero: R-0001", numero === "R-0001", numero ?? "");
  chequear("el remito impreso lleva al cliente", emitido.toUpperCase().includes(CLIENTE_DOS_DIRECCIONES));
  await captura("05-remito-emitido");

  // =========================================================================
  console.log("\nEl stock se movió");
  await ir("/productos");
  await escribirEn('input[placeholder*="Buscar por código"]', CON_PRECIO.codigo);
  await esperar(600);
  let fila = await filaDe(CON_PRECIO.codigo);
  chequear("ALAMOS quedó en -6 (un bulto de 6, sin inventario)", /-6\s*u/.test(fila), fila);

  await (await botonEnFila("Movimientos", CON_PRECIO.codigo)).click();
  await pagina.waitForFunction(
    () => !document.body.innerText.includes("Buscando los movimientos"),
    { timeout: 20000 },
  );
  await esperar(400);
  const historial = await texto();
  chequear("el historial trae el remito", historial.includes("Remito 1") && historial.includes("-6"), "no aparece el egreso");
  chequear("y dice quién fue", historial.includes("Claudia"));
  await captura("06-historial");
  await pagina.keyboard.press("Escape");
  await esperar(300);
  if ((await texto()).includes("Movimientos ·")) {
    // el modal no cierra con Escape: usar la cruz / el botón de cerrar
    const cerrar = await pagina.$('[aria-label="Cerrar"], button[title="Cerrar"]');
    if (cerrar) await cerrar.click();
  }
  await esperar(300);

  // =========================================================================
  console.log("\nEntra mercadería");
  await ir("/ingresos");
  await escribirEn('input[placeholder="Alfa Crux"]', "CATENA ZAPATA");
  await escribirEn('input[placeholder*="0001-"]', "PRUEBA-1");
  await agregarProductoAlRemito(CON_PRECIO.codigo);
  const bultos = await pagina.$('tbody input[type="number"]');
  await fijarValor(bultos, "2");
  await esperar(300);
  await (await boton("Guardar ingreso")).click();
  await esperar(4000);
  const ing = await texto();
  chequear("el ingreso queda en la lista", ing.includes("PRUEBA-1"), "no aparece");

  await ir("/productos");
  await escribirEn('input[placeholder*="Buscar por código"]', CON_PRECIO.codigo);
  await esperar(600);
  fila = await filaDe(CON_PRECIO.codigo);
  chequear("ALAMOS pasó a +6 (-6 + 2 bultos de 6)", /(^|\s)6\s*u/.test(fila) && !/-6/.test(fila), fila);
  await captura("07-stock-tras-ingreso");

  // =========================================================================
  console.log("\nCorrige el stock a mano");
  await (await botonEnFila("Ajustar", CON_PRECIO.codigo)).click();
  await esperar(500);
  const campos = await pagina.$$('form input, [role="dialog"] input, input');
  // en el modal de ajuste: el primero es la cantidad contada, el segundo la nota
  const contado = await pagina.$('input[type="number"]:not([placeholder])');
  const nota = await pagina.$('input[placeholder*="Rotura"]');
  chequear("el ajuste pide cantidad y nota", !!contado && !!nota, `campos: ${campos.length}`);
  await fijarValor(contado, "10");
  await nota.type("Conteo de prueba");
  await (await boton("Guardar ajuste")).click();
  await esperar(3500);
  fila = await filaDe(CON_PRECIO.codigo);
  chequear("queda en lo contado: 10", /(^|\s)10\s*u/.test(fila), fila);

  // =========================================================================
  console.log("\nAnula el remito");
  await ir("/remitos");
  const lista = await texto();
  chequear("R-0001 está en la lista, emitido", lista.includes("R-0001"));
  await (await botonEnFila("Anular", "R-0001")).click();
  await esperar(4000);
  const anulada = await texto();
  chequear("queda marcado anulado, no desaparece", anulada.includes("R-0001") && /anulad/i.test(anulada), "no dice anulado");
  await captura("08-remito-anulado");

  await ir("/productos");
  await escribirEn('input[placeholder*="Buscar por código"]', CON_PRECIO.codigo);
  await esperar(600);
  fila = await filaDe(CON_PRECIO.codigo);
  chequear("el stock vuelve: 10 + 6 = 16", /(^|\s)16\s*u/.test(fila), fila);

  // =========================================================================
  console.log("\nClientes, proveedores y el buscador");
  await ir("/clientes");
  await escribirEn('input[placeholder*="Buscar por nombre"]', CLIENTE_DOS_DIRECCIONES);
  await esperar(600);
  const filaCli = await filaDe(CLIENTE_DOS_DIRECCIONES);
  const vecesGuadalupe = await pagina.evaluate(
    (n) => [...document.querySelectorAll("tbody tr")].filter((tr) => tr.innerText.toUpperCase().includes(n)).length,
    CLIENTE_DOS_DIRECCIONES,
  );
  chequear(`${CLIENTE_DOS_DIRECCIONES} aparece una sola vez, con la segunda dirección como "+1"`, vecesGuadalupe === 1 && filaCli.includes("+1"), `${vecesGuadalupe} filas · ${filaCli}`);
  await (await botonEnFila("Direcciones", CLIENTE_DOS_DIRECCIONES)).click();
  await esperar(500);
  const dirs = await texto();
  chequear("se ven las dos: Uriburu y La Pampa", dirs.includes("URIBURU") && dirs.includes("LA PAMPA"), "faltan direcciones");
  await captura("09-cliente-direcciones");

  await ir("/proveedores");
  const nProv = await pagina.evaluate(() => document.querySelectorAll("tbody tr").length);
  chequear("proveedores: los 30 reales", nProv === 30, `hay ${nProv}`);

  await pagina.keyboard.down("Control");
  await pagina.keyboard.press("k");
  await pagina.keyboard.up("Control");
  await esperar(400);
  const global = await pagina.$('input[placeholder*="Buscar producto, cliente"]');
  await global.type("alamos");
  await esperar(800);
  const res = await texto();
  chequear("Ctrl+K busca en el catálogo real", res.includes("ALAMOS"), "no aparecen resultados");
  await captura("10-buscador-global");
  await pagina.keyboard.press("Escape");

  // =========================================================================
  console.log("\nFederico entra");
  await salir();
  await entrar("federico");
  const panel = await texto();
  chequear("ve el panel con la plata", panel.includes("Vendido este mes") && panel.includes("Stock valorizado"));
  chequear("el remito anulado no suma al vendido del mes", /Vendido este mes\s*\$\s*0/.test(panel), panel.match(/Vendido este mes[\s\S]{0,40}/)?.[0]);
  // "Últimos remitos" del panel muestra solo emitidos: el anulado NO va, y eso
  // es lo correcto. Que aparezca marcado se ve en la pantalla de Remitos.
  await captura("11-panel-federico");
  await ir("/remitos");
  chequear("Federico ve el remito anulado en la lista de Remitos", (await texto()).includes("R-0001"));

  console.log("\nFederico le pone precio a un producto 'a consultar'");
  await ir("/productos");
  await escribirEn('input[placeholder*="Buscar por código"]', SIN_PRECIO.codigo);
  await esperar(600);
  await (await botonEnFila("Editar", SIN_PRECIO.codigo)).click();
  await esperar(500);
  const campoPrecio = await inputDeEtiqueta("Precio por unidad");
  await fijarValor(campoPrecio, "12345");
  await esperar(300);
  await (await boton("Guardar cambios")).click();
  // Guardar un producto recarga el catálogo entero (4.323 filas, ~4 s): hay que
  // esperar a que termine antes de mirar la fila. Es lento pero no está roto.
  await pagina.waitForFunction(
    (codigo) => {
      const tr = [...document.querySelectorAll("tbody tr")].find((t) => t.innerText.includes(codigo));
      return tr && !tr.innerText.includes("a consultar");
    },
    { timeout: 30000 },
    SIN_PRECIO.codigo,
  ).catch(() => {});
  fila = await filaDe(SIN_PRECIO.codigo);
  chequear("al guardar el precio la marca 'a consultar' se cae sola", !fila.includes("a consultar") && fila.includes("12.345"), fila);
  await captura("12-precio-cargado");

  // =========================================================================
  console.log("\nErrores de JavaScript");
  const graves = errores.filter((e) => !/favicon|net::ERR_ABORTED|hydrat/i.test(e));
  chequear("la consola no tira errores", graves.length === 0, graves.slice(0, 3).join(" | "));
} catch (e) {
  fallos++;
  console.log(`  MAL  ${String(e).split("\n")[0]}`);
  await captura("error");
} finally {
  await navegador.close();

  // Dejar la base como estaba.
  console.log("\nLimpieza");
  try {
    execFileSync("python", ["scripts/datos_ejemplo.py", "--limpiar"], { stdio: "ignore" });
    execFileSync(
      "python",
      [
        "-c",
        [
          "import sys, pathlib, psycopg",
          "sys.path.insert(0, str(pathlib.Path('scripts').resolve()))",
          "import migrar",
          "con = psycopg.connect(migrar.url_conexion(migrar.leer_env()))",
          `con.execute("update productos set precio_lista = 0, precio_a_consultar = true where codigo = '${SIN_PRECIO.codigo}'")`,
          "con.commit()",
        ].join("\n"),
      ],
      { stdio: "ignore" },
    );
    console.log("  OK   movimiento borrado, numeración en R-0001, el producto vuelve a 'a consultar'");
  } catch (e) {
    console.log(`  MAL  no pude limpiar: ${String(e).split("\n")[0]}`);
    fallos++;
  }
}

console.log(`\nCapturas en scripts/capturas/recorrido-*.png`);
if (fallos) {
  console.log(`${fallos} chequeo(s) fallaron.`);
  process.exit(1);
}
console.log("Todo OK.");
