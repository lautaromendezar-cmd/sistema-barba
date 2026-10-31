/**
 * El teléfono como lo pide wa.me: 549 + característica + número. Vacío si no
 * se entiende: WhatsApp abre igual y se elige el contacto a mano.
 */
export function telefonoWhatsApp(telefono?: string | null) {
  let n = (telefono ?? "").replace(/\D/g, "");
  if (n.startsWith("54")) n = n.slice(2);
  if (n.startsWith("9")) n = n.slice(1);
  if (n.startsWith("0")) n = n.slice(1);
  // 11 15 6504 7011 -> 11 6504 7011
  if (n.length === 12 && n.startsWith("1115")) n = `11${n.slice(4)}`;
  // 15 6504 7011 sin característica: acá es Capital y GBA.
  if (n.length === 10 && n.startsWith("15")) n = `11${n.slice(2)}`;
  return n.length === 10 ? `549${n}` : "";
}

/** El link que abre WhatsApp con el mensaje listo para mandar. */
export function linkWhatsApp(
  numeroRemito: string,
  codigoPublico: string,
  telefono: string | null | undefined,
  origen: string,
) {
  const texto =
    `Hola! Te enviamos el remito ${numeroRemito} de Grupo Barba: ` +
    `${origen}/r/${codigoPublico}\n\nAvisanos si está todo bien. Gracias!`;
  return `https://wa.me/${telefonoWhatsApp(telefono)}?text=${encodeURIComponent(texto)}`;
}
