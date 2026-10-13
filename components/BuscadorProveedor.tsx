"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { coincide, normalizar } from "@/lib/texto";

/**
 * Elegir un proveedor escribiendo parte del nombre, la razón social o el CUIT.
 * Solo se puede elegir uno de la lista: lo que se tipea es para buscar, no se
 * guarda. Antes el campo era texto libre y un ingreso de ROLLAND quedó
 * guardado como «ANDESMAR».
 */
export function BuscadorProveedor({
  valor,
  onElegir,
  placeholder = "Buscar proveedor por nombre o CUIT…",
}: {
  valor: string;
  onElegir: (id: string) => void;
  placeholder?: string;
}) {
  const { db } = useStore();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);

  const elegido = db.proveedores.find((v) => v.id === valor);

  const resultados = useMemo(() => {
    const t = normalizar(q);
    const activos = db.proveedores.filter((v) => v.activo !== false);
    if (!t) return activos.slice(0, 8);
    const cuit = t.replace(/\D/g, "");
    return activos
      .filter(
        (v) =>
          coincide(v.nombre, t) ||
          coincide(v.razonSocial, t) ||
          (cuit.length >= 3 && v.cuit.replace(/\D/g, "").includes(cuit)),
      )
      .slice(0, 8);
  }, [q, db.proveedores]);

  function elegir(id: string) {
    onElegir(id);
    setQ("");
    setAbierto(false);
  }

  if (elegido)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-medium">{elegido.nombre}</span>
          {(elegido.razonSocial && elegido.razonSocial !== elegido.nombre) ||
          elegido.cuit ? (
            <span className="block truncate text-xs text-faint">
              {[
                elegido.razonSocial !== elegido.nombre && elegido.razonSocial,
                elegido.cuit && `CUIT ${elegido.cuit}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => onElegir("")}
          className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
        >
          Cambiar
        </button>
      </div>
    );

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        // Un momento para que el clic en la lista llegue antes de cerrarla.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (q.trim() && resultados[0]) elegir(resultados[0].id);
          }
          if (e.key === "Escape") {
            setQ("");
            setAbierto(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
      />

      {abierto && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {resultados.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(v.id)}
                className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-acento-soft"
              >
                <span className="block truncate text-sm">{v.nombre}</span>
                {(v.razonSocial && v.razonSocial !== v.nombre) || v.cuit ? (
                  <span className="block truncate text-xs text-faint">
                    {[
                      v.razonSocial !== v.nombre && v.razonSocial,
                      v.cuit && `CUIT ${v.cuit}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {resultados.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted">
              No hay ningún proveedor con ese nombre. Si es nuevo, se agrega en
              Proveedores.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
