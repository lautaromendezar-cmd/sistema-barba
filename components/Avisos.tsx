"use client";

import { useStore } from "@/lib/store";

/**
 * Los avisos de abajo a la derecha. Lo que salió bien se va solo; un error se
 * queda hasta que lo cierran, para que nadie se quede con la duda de si se
 * guardó. Mientras no hay internet hay uno fijo que no se puede cerrar.
 */
export function Avisos() {
  const { avisos, cerrarAviso, sinConexion } = useStore();
  if (avisos.length === 0 && !sinConexion) return null;

  return (
    <div className="no-print pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
      {sinConexion && (
        <div
          role="alert"
          className="aviso-entra pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-ink bg-ink px-4 py-3 text-sm text-white shadow-lg"
        >
          <Punto className="bg-acento" />
          <div className="flex-1">
            <div className="font-medium">Sin conexión a internet</div>
            <div className="mt-0.5 text-white/70">
              Lo que cargues ahora no se va a guardar. Esperá a que vuelva.
            </div>
          </div>
        </div>
      )}
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tipo === "error" ? "alert" : "status"}
          className={`aviso-entra pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg ${
            a.tipo === "error" ? "border-alerta/40" : "border-line"
          }`}
        >
          <Punto className={a.tipo === "error" ? "bg-alerta" : "bg-ok"} />
          <div className={`flex-1 ${a.tipo === "error" ? "text-alerta" : ""}`}>
            {a.texto}
          </div>
          <button
            onClick={() => cerrarAviso(a.id)}
            aria-label="Cerrar aviso"
            className="text-faint hover:text-ink -my-1 -mr-1 shrink-0 rounded px-1.5 py-1 leading-none transition"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function Punto({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`mt-1.5 size-2 shrink-0 rounded-full ${className}`}
    />
  );
}
