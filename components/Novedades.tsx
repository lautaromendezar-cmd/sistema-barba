"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { fecha } from "@/lib/formato";
import { COMMIT, NOVEDADES, VERSION } from "@/lib/version";

const CLAVE_VISTA = "barba:version-vista";

/**
 * El número de versión. Al tocarlo se abre la lista de novedades. Si hubo una
 * versión nueva desde la última vez que esta PC las miró, lleva un punto.
 */
export function Novedades({ className = "" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  // Este componente no se genera en el servidor (el Shell muestra «Cargando…»
  // hasta saber si hay sesión), así que se puede leer el almacenamiento acá.
  // Sin acceso a él (ventana privada, bloqueado) no se marca nada como nuevo.
  const [hayNueva, setHayNueva] = useState(() => {
    try {
      const vista = localStorage.getItem(CLAVE_VISTA);
      return vista !== null && vista !== VERSION;
    } catch {
      return false;
    }
  });

  // La primera vez que se entra no hay nada «nuevo»: se anota la actual.
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_VISTA) === null)
        localStorage.setItem(CLAVE_VISTA, VERSION);
    } catch {}
  }, []);

  function abrir() {
    setAbierto(true);
    setHayNueva(false);
    try {
      localStorage.setItem(CLAVE_VISTA, VERSION);
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title={COMMIT ? `Versión ${VERSION} · ${COMMIT}` : `Versión ${VERSION}`}
        className={`inline-flex items-center gap-1.5 underline-offset-2 hover:underline ${className}`}
      >
        v{VERSION}
        {hayNueva && (
          <span className="bg-acento rounded px-1.5 py-px text-[10px] font-semibold text-ink no-underline">
            nuevo
          </span>
        )}
      </button>

      {abierto && (
        <Modal titulo="Novedades del sistema" onCerrar={() => setAbierto(false)}>
          <div className="space-y-6">
            {NOVEDADES.map((n) => (
              <section key={n.version}>
                <h3 className="flex items-baseline gap-2 border-b border-line pb-1.5">
                  <span className="titulo text-base font-semibold">
                    Versión {n.version}
                  </span>
                  <span className="tnum text-xs text-faint">
                    {fecha(`${n.fecha}T12:00:00`)}
                  </span>
                  {n.version === VERSION && (
                    <span className="bg-acento-soft text-acento-ink rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
                      Actual
                    </span>
                  )}
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                  {n.cambios.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
