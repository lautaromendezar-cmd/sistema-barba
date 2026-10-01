import type { Cliente } from "./types";

/** C-0001. Vacio si la base todavia no le puso numero. */
export function codigoCliente(numero?: number) {
  return numero ? `C-${String(numero).padStart(4, "0")}` : "";
}

/** La razon social si esta cargada; si no, el apodo. */
export function nombreCliente(c?: Pick<Cliente, "nombre" | "razonSocial">) {
  if (!c) return "";
  return c.razonSocial?.trim() || c.nombre;
}

/** Todo lo que sirve para encontrar a un cliente en un buscador. */
export function textoBuscableCliente(c: Cliente) {
  return `${codigoCliente(c.numero)} ${c.numero ?? ""} ${c.nombre} ${c.razonSocial ?? ""}`;
}

/**
 * Lo deja como 30-71029502-2 si tiene 11 digitos, escrito como sea. Si no, lo
 * devuelve como vino y `cuitValido` dice que no.
 */
export function formatearCuit(texto: string) {
  const d = texto.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}` : texto.trim();
}

/** El mismo control que hace la base (0015): formato y digito verificador. */
export function cuitValido(cuit: string) {
  if (!/^\d{2}-\d{8}-\d$/.test(cuit)) return false;
  const d = cuit.replace(/-/g, "").split("").map(Number);
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let v = 11 - (pesos.reduce((s, p, i) => s + p * d[i], 0) % 11);
  if (v === 11) v = 0;
  if (v === 10) v = 9;
  return v === d[10];
}
