/**
 * Carga las respuestas de Federico al Excel «lo que falta del inventario»
 * (datos/Grupo Barba - lo que falta del inventario CORREGIDO 17hs.xlsx, 20-oct).
 *
 *   npx tsx scripts/cargar_respuestas_20oct.ts            # en seco: muestra el plan
 *   npx tsx scripts/cargar_respuestas_20oct.ts --aplicar  # escribe en la base
 *
 * Entra como federico (CLAVE_DEV_FEDERICO en .env.local). Se puede correr las
 * veces que haga falta: un producto que ya existe no se vuelve a crear y
 * ajustar_stock no escribe nada si el stock ya es el pedido.
 *
 * Los conteos son los del inventario del 13-oct. Si un producto tuvo otros
 * movimientos después (remito, ingreso), se le suman al conteo para no pisarlos.
 *
 * Queda afuera: los 46 productos nuevos sin «botellas por caja» (vino en blanco).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(clave: string): string {
  const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith(clave + "=")) {
      return linea.slice(clave.length + 1).trim().replace(/^"|"$/g, "");
    }
  }
  throw new Error(`Falta ${clave} en .env.local`);
}

const APLICAR = process.argv.includes("--aplicar");
const NOTA = "Inventario: respuestas de Federico del 20-oct";

const supabase = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
);

// --- Productos existentes: stock contado y, si hace falta, algún dato -------

type Ajuste = {
  codigo: string;
  contado: number;
  cambios?: Record<string, unknown>;
  porque: string;
};

const AJUSTES: Ajuste[] = [
  { codigo: "W2399", contado: 15, porque: "P1 Pispi: 15" },
  { codigo: "W716", contado: 6, porque: "P2 Animal Colección: 6 botellas" },
  {
    codigo: "W4396",
    contado: 9,
    cambios: { unidades_por_bulto: 4, presentacion: "Caja x 4 bot x1500cc" },
    porque: "P3 Salentein Magnum: caja x4, 1c + 5s",
  },
  { codigo: "W1067", contado: 18, porque: "P4 Doña Paula Selección: vale una fila, 18" },
  { codigo: "W4412", contado: 45, porque: "P5 Trivento Golden CS" },
  { codigo: "W3366", contado: 18, porque: "P6 Trivento Golden CF" },
  { codigo: "W4681", contado: 40, porque: "P8 Catena Malbec Argentino x6 (él escribió W4686)" },
  { codigo: "W44506", contado: 10, porque: "P10 Birth of Catena x6: 1c + 4s" },
  { codigo: "W3966", contado: 2, porque: "P12-13 Chachingo Porter + Amber como Blonde" },
  { codigo: "W1999", contado: 8, porque: "P16 Las Perdices: 3 + 5" },
  { codigo: "W2972", contado: 22, porque: "P17 Codorníu Método Tradicional: 20 + 2" },
  { codigo: "W2974", contado: 13, porque: "P18 Codorníu Brut Nature: 8 + 5" },
  {
    codigo: "W4160",
    contado: 6,
    cambios: { nombre: "HERMANOS TORRONTÉS" },
    porque: "Códigos invertidos: W4160 es el Torrontés (1c)",
  },
  { codigo: "W3962", contado: 3, porque: "La Biblia de Judas: 1 caja de 3" },
  { codigo: "W4406", contado: 6, porque: "Trivento Reserve White Blend: 1c" },
  { codigo: "W2547", contado: 18, porque: "Pascual Toso Estate CS: 3c" },
];

// --- Productos nuevos: entran «a consultar» (precio 0) ------------------------

type Nuevo = {
  codigo: string;
  nombre: string;
  bodega: string;
  seccion: string;
  presentacion: string;
  caja: number;
  suelto: boolean;
  cajas: number;
  sueltas: number;
};

const VINOS = "Vinos";
const ACEITES = "Aceites, Pastas y Aceto";
const x6 = "Caja x 6 bot x750cc";

const NUEVOS: Nuevo[] = [
  { codigo: "W4164", nombre: "HERMANOS MALBEC 2025", bodega: "DOMINGO MOLINA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 4, sueltas: 0 },
  { codigo: "W4166", nombre: "SAL DE AQUÍ SAL MARINA GRANO MEDIO ZIPPER 300 G", bodega: "SAL DE AQUÍ", seccion: ACEITES, presentacion: "Caja x 12 x 300 g", caja: 12, suelto: true, cajas: 0, sueltas: 9 },
  { codigo: "W4185", nombre: "GRAN ENEMIGO GUALTALLARY CABERNET FRANC 2018", bodega: "CATENA ZAPATA", seccion: VINOS, presentacion: x6, caja: 6, suelto: true, cajas: 0, sueltas: 2 },
  { codigo: "W429", nombre: "BIPLANO BLEND DE TINTAS 2019", bodega: "BIPLANO", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 2, sueltas: 0 },
  { codigo: "W4377", nombre: "BRAMARE VALLE DE UCO CHARDONNAY", bodega: "VIÑA COBOS", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 5, sueltas: 0 },
  { codigo: "W4745", nombre: "ALAMOS CABERNET FRANC", bodega: "CATENA ZAPATA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 4, sueltas: 0 },
  { codigo: "W4746", nombre: "NICASIA ROSÉ BLEND", bodega: "CATENA ZAPATA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 6, sueltas: 0 },
  { codigo: "W4747", nombre: "D.V. CATENA ACEITE DE OLIVA BLEND DE FAMILIA 500 ML", bodega: "ACEITES", seccion: ACEITES, presentacion: "Caja x 6 x 500 mlts", caja: 6, suelto: true, cajas: 0, sueltas: 2 },
  { codigo: "W4748", nombre: "D.V. CATENA ACEITE DE OLIVA BLEND ROBUSTO 500 ML", bodega: "ACEITES", seccion: ACEITES, presentacion: "Caja x 6 x 500 mlts", caja: 6, suelto: true, cajas: 0, sueltas: 6 },
  { codigo: "W4750", nombre: "WAPISA MALBEC", bodega: "WAPISA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 1, sueltas: 0 },
  { codigo: "W4757", nombre: "GRAN ENEMIGO GUALTALLARY CABERNET FRANC 2023", bodega: "CATENA ZAPATA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 3, sueltas: 0 },
  { codigo: "W4758", nombre: "ESPUMANTE SALENTEIN BLANC DE NOIRS", bodega: "SALENTEIN", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 8, sueltas: 0 },
  { codigo: "W4762", nombre: "MYTHIC MOUNTAIN CABERNET FRANC", bodega: "MYTHIC", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 2, sueltas: 0 },
  { codigo: "W4763", nombre: "CHAKANA UCO SELECCIÓN MALBEC", bodega: "CHAKANA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 4, sueltas: 0 },
  { codigo: "W4764", nombre: "CHAKANA NUNA WHITE BLEND ORGÁNICO", bodega: "CHAKANA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 3, sueltas: 0 },
  { codigo: "W4765", nombre: "CHAKANA NUNA MALBEC ORGÁNICO", bodega: "CHAKANA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 1, sueltas: 0 },
  { codigo: "W4766", nombre: "CHAKANA AYNI ESPUMANTE BRUT NATURE", bodega: "CHAKANA", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 1, sueltas: 0 },
  // «YA NO HAY STOCK»: se da de alta igual, en 0.
  { codigo: "W4767", nombre: "BLACK COLIBRÍ RESERVA MALBEC", bodega: "BLACK COLIBRÍ", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 0, sueltas: 0 },
  // Tenía 3c + 3s; las 3 cajas salieron del 13 al 15-oct (en la planilla, W4682).
  { codigo: "W4768", nombre: "OWNER WHITE BLEND", bodega: "OWNER", seccion: VINOS, presentacion: x6, caja: 6, suelto: true, cajas: 0, sueltas: 3 },
  { codigo: "W4769", nombre: "OWNER BLEND ESPECIAL CAJA CARTÓN", bodega: "OWNER", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 8, sueltas: 0 },
  { codigo: "W4770", nombre: "OWNER MALBEC CAJA DE MADERA X4", bodega: "OWNER", seccion: VINOS, presentacion: "Caja x 4 bot x750cc", caja: 4, suelto: false, cajas: 12, sueltas: 1 },
  // P7: código nuevo. La caja sale de su planilla (4c = 24).
  { codigo: "W4817", nombre: "OWNER MALBEC RED BLEND", bodega: "OWNER", seccion: VINOS, presentacion: x6, caja: 6, suelto: false, cajas: 4, sueltas: 0 },
  // P11: W4177 no existía. Caja de 12 como el resto de Casalta (su planilla: 1c + 1s = 13).
  { codigo: "W4177", nombre: "CASALTA CLÁSICO VIDRIO X 400", bodega: "ACEITES", seccion: ACEITES, presentacion: "12 X 400", caja: 12, suelto: true, cajas: 1, sueltas: 1 },
];

// --- Ejecución ----------------------------------------------------------------

type Producto = { id: string; codigo: string; nombre: string; unidades_por_bulto: number };

async function stockYOtros(productoId: string) {
  const { data, error } = await supabase
    .from("movimientos")
    .select("tipo, unidades")
    .eq("producto_id", productoId);
  if (error) throw error;
  const filas = data ?? [];
  return {
    stock: filas.reduce((a, m) => a + m.unidades, 0),
    // Lo que se movió aparte del inventario: se suma al conteo.
    otros: filas.filter((m) => m.tipo !== "inventario_inicial").reduce((a, m) => a + m.unidades, 0),
  };
}

async function ajustar(p: Producto, contado: number, porque: string) {
  const { stock, otros } = await stockYOtros(p.id);
  const objetivo = contado + otros;
  const extra = otros ? ` (conteo ${contado} ${otros > 0 ? "+" : "−"} ${Math.abs(otros)} movido después)` : "";
  if (stock === objetivo) {
    console.log(`  = ${p.codigo.padEnd(7)} ${p.nombre.slice(0, 45).padEnd(45)} ya tiene ${stock}`);
    return;
  }
  console.log(`  ~ ${p.codigo.padEnd(7)} ${p.nombre.slice(0, 45).padEnd(45)} ${stock} → ${objetivo}${extra}   [${porque}]`);
  if (!APLICAR) return;
  const { error } = await supabase.rpc("ajustar_stock", {
    p_producto_id: p.id,
    p_unidades_contadas: objetivo,
    p_nota: NOTA,
    p_tipo: "inventario_inicial",
  });
  if (error) throw new Error(`${p.codigo}: ${error.message}`);
}

async function main() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "federico@barba.local",
    password: env("CLAVE_DEV_FEDERICO"),
  });
  if (error) throw new Error(`No se pudo entrar: ${error.message}`);

  console.log(APLICAR ? "APLICANDO\n" : "EN SECO (no escribe nada; --aplicar para cargar)\n");

  const codigos = [...AJUSTES.map((a) => a.codigo), ...NUEVOS.map((n) => n.codigo)];
  const { data, error: e2 } = await supabase
    .from("productos")
    .select("id, codigo, nombre, unidades_por_bulto")
    .in("codigo", codigos);
  if (e2) throw e2;
  const porCodigo = new Map((data ?? []).map((p) => [p.codigo, p as Producto]));

  console.log(`Existentes (${AJUSTES.length}):`);
  for (const a of AJUSTES) {
    let p = porCodigo.get(a.codigo);
    if (!p) throw new Error(`${a.codigo} no existe y debería`);
    if (a.cambios) {
      console.log(`  * ${a.codigo.padEnd(7)} ${JSON.stringify(a.cambios)}`);
      if (APLICAR) {
        const { error } = await supabase.from("productos").update(a.cambios).eq("id", p.id);
        if (error) throw new Error(`${a.codigo}: ${error.message}`);
        p = { ...p, ...(a.cambios as Partial<Producto>) };
      }
    }
    await ajustar(p, a.contado, a.porque);
  }

  console.log(`\nNuevos (${NUEVOS.length}):`);
  let botellas = 0;
  for (const n of NUEVOS) {
    const contado = n.cajas * n.caja + n.sueltas;
    botellas += contado;
    let p = porCodigo.get(n.codigo);
    if (!p) {
      console.log(`  + ${n.codigo.padEnd(7)} ${n.nombre.slice(0, 45).padEnd(45)} x${n.caja}${n.suelto ? " suelto" : ""}  → ${contado}`);
      if (!APLICAR) continue;
      const { data: creado, error } = await supabase
        .from("productos")
        .insert({
          codigo: n.codigo,
          nombre: n.nombre,
          bodega: n.bodega,
          seccion: n.seccion,
          presentacion: n.presentacion,
          unidades_por_bulto: n.caja,
          se_vende_suelto: n.suelto,
          precio_lista: 0,
          precio_a_consultar: true,
          en_lista_actual: true,
        })
        .select("id, codigo, nombre, unidades_por_bulto")
        .single();
      if (error) throw new Error(`${n.codigo}: ${error.message}`);
      p = creado as Producto;
    }
    if (contado > 0 || porCodigo.has(n.codigo)) await ajustar(p, contado, "alta");
  }
  console.log(`\n${NUEVOS.length} nuevos, ${botellas} unidades.`);
  if (!APLICAR) console.log("\nNada escrito. Para cargar: --aplicar");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
