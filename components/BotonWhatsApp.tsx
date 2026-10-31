"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { IconoWhatsApp } from "./IconoWhatsApp";
import { linkRemito, linkWhatsApp, telefonoWhatsApp } from "@/lib/whatsapp";
import type { Remito } from "@/lib/types";

const ICONO = "size-3.5 shrink-0";
const IconoCopiar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICONO} aria-hidden>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconoListo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={ICONO} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Mandar el remito al cliente: abrir WhatsApp con el mensaje listo, o copiar
 * el link para pegarlo donde quieran. Sin un teléfono que sirva, WhatsApp abre
 * sin destinatario y se elige el contacto allá. El teléfono sale de la ficha
 * de hoy (se pudo cargar después de emitir) y si no, de la copia del remito.
 */
export function BotonWhatsApp({
  remito,
  compacto,
  className = "",
}: {
  remito: Remito;
  /** En la lista: solo los íconos, como en la tabla de facturas del CRM. */
  compacto?: boolean;
  /** Tamaño y márgenes de la versión con texto. */
  className?: string;
}) {
  const { cliente } = useStore();
  const [copiado, setCopiado] = useState(false);
  if (remito.estado !== "emitido" || !remito.codigoPublico) return null;
  const telefono =
    cliente(remito.clienteId)?.telefono || remito.clienteDatos?.telefono;
  const codigo = remito.codigoPublico;

  const abrir = () =>
    window.open(
      linkWhatsApp(remito.numero, codigo, telefono),
      "_blank",
      "noopener",
    );
  const copiar = async () => {
    const link = linkRemito(codigo);
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      prompt("Copiá el link:", link);
    }
  };
  const ayuda = telefonoWhatsApp(telefono)
    ? "Enviar por WhatsApp"
    : "Enviar por WhatsApp (sin teléfono cargado: elegís el contacto allá)";
  const icono = "inline-flex size-[26px] items-center justify-center rounded transition";

  if (compacto)
    return (
      <>
        <button onClick={abrir} title={ayuda} aria-label={ayuda} className={`${icono} text-emerald-600 hover:bg-emerald-50`}>
          <IconoWhatsApp className={ICONO} />
        </button>
        <button
          onClick={copiar}
          title="Copiar link"
          aria-label={copiado ? "Link copiado" : "Copiar link"}
          className={`${icono} text-muted hover:bg-canvas hover:text-acento-ink`}
        >
          {copiado ? <IconoListo /> : <IconoCopiar />}
        </button>
      </>
    );

  return (
    <>
      <button
        onClick={abrir}
        title={ayuda}
        className={`inline-flex items-center gap-1.5 bg-[#128C4A] font-medium text-white transition hover:bg-[#0E7239] ${className}`}
      >
        <IconoWhatsApp className="size-4 shrink-0" />
        Enviar por WhatsApp
      </button>
      <button
        onClick={copiar}
        aria-label={copiado ? "Link copiado" : "Copiar link"}
        className={`inline-flex items-center gap-1.5 border border-line bg-surface transition hover:border-ink hover:text-acento-ink ${className}`}
      >
        {copiado ? <IconoListo /> : <IconoCopiar />}
        {copiado ? "Copiado" : "Copiar link"}
      </button>
    </>
  );
}
