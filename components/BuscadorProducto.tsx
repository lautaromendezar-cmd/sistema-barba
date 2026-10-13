"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { money, enBultos } from "@/lib/formato";
import { coincide, normalizar } from "@/lib/texto";
import type { Producto } from "@/lib/types";

/**
 * Buscador por código o nombre. Con 541 productos, escribir el código y que
 * enter agregue la línea es lo que hace rápida la carga.
 */
export function BuscadorProducto({
  onElegir,
  excluir = [],
  mostrarStock = true,
  placeholder = "Buscar por código o nombre… (Enter agrega el primero)",
}: {
  onElegir: (p: Producto) => void;
  excluir?: string[];
  mostrarStock?: boolean;
  placeholder?: string;
}) {
  const { db, stock } = useStore();
  const [q, setQ] = useState("");

  // Los productos vienen ordenados por nombre: buscando "3389", uno cuyo
  // codigo solo CONTIENE eso podia quedar primero y Enter lo agregaba en vez
  // del 3389. El codigo exacto va siempre arriba, despues los que empiezan
  // con lo escrito, y recien despues el resto.
  const resultados = useMemo(() => {
    const t = normalizar(q);
    if (!t) return [];
    const rango = (p: Producto) => {
      const codigo = normalizar(p.codigo);
      if (codigo === t) return 0;
      if (codigo.startsWith(t)) return 1;
      return 2;
    };
    return db.productos
      .filter((p) => !excluir.includes(p.codigo))
      .filter(
        (p) =>
          coincide(p.codigo, t) ||
          coincide(p.nombre, t) ||
          coincide(p.bodega, t),
      )
      .map((p) => ({ p, r: rango(p) }))
      .sort((a, b) => a.r - b.r)
      .slice(0, 8)
      .map((x) => x.p);
  }, [q, db.productos, excluir]);

  function elegir(p: Producto) {
    onElegir(p);
    setQ("");
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (resultados[0]) elegir(resultados[0]);
          }
          if (e.key === "Escape") setQ("");
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink"
      />

      {resultados.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {resultados.map((p) => {
            const s = stock(p.codigo);
            return (
              <li key={p.codigo}>
                <button
                  type="button"
                  onClick={() => elegir(p)}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-acento-soft"
                >
                  <span className="tnum w-14 shrink-0 font-mono text-xs text-muted">
                    {p.codigo}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.nombre}</span>
                    <span className="block truncate text-xs text-faint">
                      {p.bodega} · {p.presentacion} · {money(p.precioLista)}/u
                    </span>
                  </span>
                  {mostrarStock && (
                    <span
                      className={`tnum shrink-0 text-xs ${
                        s <= 0 ? "font-semibold text-alerta" : "text-muted"
                      }`}
                    >
                      {enBultos(s, p.unidadesPorBulto)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
