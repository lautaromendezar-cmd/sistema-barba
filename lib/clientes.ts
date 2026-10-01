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
