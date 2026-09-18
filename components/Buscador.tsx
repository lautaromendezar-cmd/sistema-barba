"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { normalizar } from "@/lib/texto";
import { money } from "@/lib/formato";

type Resultado = {
  tipo: "Producto" | "Cliente" | "Remito";
  titulo: string;
  detalle: string;
  destino: string;
};

/**
 * Buscador único de la barra de arriba: productos, clientes y remitos en la
 * misma caja. En un sistema que se usa todo el día, que haya que adivinar en
 * qué pantalla está el buscador correcto es una fricción diaria.
 */
export function Buscador() {
  const { db, stock } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node))
        setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  // Ctrl/Cmd + K, que es donde la mano va sola.
  useEffect(() => {
    function atajo(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        caja.current?.querySelector("input")?.focus();
      }
    }
    document.addEventListener("keydown", atajo);
    return () => document.removeEventListener("keydown", atajo);
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    const busca = normalizar(q);
    if (busca.length < 2) return [];

    const productos: Resultado[] = db.productos
      .filter(
        (p) =>
          normalizar(p.nombre).includes(busca) ||
          normalizar(p.codigo).includes(busca) ||
          normalizar(p.bodega).includes(busca),
      )
      .slice(0, 5)
      .map((p) => ({
        tipo: "Producto",
        titulo: p.nombre,
        detalle: `${p.codigo} · ${money(p.precioLista)} · ${stock(p.codigo)} u`,
        destino: "/productos",
      }));

    const clientes: Resultado[] = db.clientes
      .filter(
        (c) =>
          normalizar(c.nombre).includes(busca) ||
          normalizar(c.localidad ?? "").includes(busca),
      )
      .slice(0, 4)
      .map((c) => ({
        tipo: "Cliente",
        titulo: c.nombre,
        detalle: [c.direccion, c.localidad].filter(Boolean).join(" · "),
        destino: "/clientes",
      }));

    const remitos: Resultado[] = db.remitos
      .filter((r) => {
        const cli = db.clientes.find((c) => c.id === r.clienteId);
        return (
          normalizar(r.numero).includes(busca) ||
          normalizar(cli?.nombre ?? "").includes(busca)
        );
      })
      .slice(0, 4)
      .map((r) => ({
        tipo: "Remito",
        titulo: r.numero,
        detalle:
          db.clientes.find((c) => c.id === r.clienteId)?.nombre ?? "sin cliente",
        destino: "/remitos",
      }));

    return [...productos, ...clientes, ...remitos];
  }, [q, db, stock]);

  return (
    <div ref={caja} className="relative w-full max-w-md">
      <div className="border-line focus-within:border-ink flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition">
        <svg viewBox="0 0 20 20" className="text-faint h-4 w-4 shrink-0" fill="none">
          <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="m13.5 13.5 3 3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar producto, cliente o remito…"
          className="w-full text-sm outline-none placeholder:text-faint"
        />
        <kbd className="border-line text-faint hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:block">
          Ctrl K
        </kbd>
      </div>

      {abierto && q.trim().length >= 2 && (
        <div className="border-line bg-surface absolute top-full z-40 mt-2 w-full overflow-hidden rounded-lg border shadow-lg">
          {resultados.length === 0 ? (
            <p className="text-faint px-4 py-5 text-center text-sm">
              Nada coincide con «{q}».
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {resultados.map((r, i) => (
                <li key={`${r.tipo}-${r.titulo}-${i}`}>
                  <button
                    onClick={() => {
                      router.push(r.destino);
                      setAbierto(false);
                      setQ("");
                    }}
                    className="border-line hover:bg-canvas flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-0"
                  >
                    <span className="bg-canvas text-faint w-[74px] shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide uppercase">
                      {r.tipo}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.titulo}
                      </span>
                      <span className="text-muted block truncate text-xs">
                        {r.detalle}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** El escudo, para usar sobre el panel oscuro. */
export function EscudoClaro({ className }: { className?: string }) {
  return (
    <Image
      src="/marca/escudo-claro.png"
      alt=""
      width={310}
      height={350}
      className={className}
      priority
    />
  );
}
