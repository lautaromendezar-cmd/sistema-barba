"use client";

import { useStore } from "@/lib/store";
import { linkWhatsApp, telefonoWhatsApp } from "@/lib/whatsapp";
import type { Remito } from "@/lib/types";

/**
 * Abre WhatsApp con el link del remito. Sin un teléfono que sirva abre sin
 * destinatario y se elige el contacto allá. El teléfono sale de la ficha de
 * hoy (se pudo cargar después de emitir) y si no, de la copia del remito.
 */
export function BotonWhatsApp({
  remito,
  className,
}: {
  remito: Remito;
  className: string;
}) {
  const { cliente } = useStore();
  if (remito.estado !== "emitido" || !remito.codigoPublico) return null;
  const telefono =
    cliente(remito.clienteId)?.telefono || remito.clienteDatos?.telefono;
  const codigo = remito.codigoPublico;
  return (
    <button
      title={
        telefonoWhatsApp(telefono)
          ? "Abre WhatsApp con el mensaje listo para este cliente"
          : "El cliente no tiene teléfono cargado: elegís el contacto en WhatsApp"
      }
      onClick={() =>
        window.open(
          linkWhatsApp(remito.numero, codigo, telefono, window.location.origin),
          "_blank",
          "noopener",
        )
      }
      className={className}
    >
      Enviar por WhatsApp
    </button>
  );
}
