"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Login } from "./Login";
import { Buscador, EscudoClaro } from "./Buscador";
import { Avisos } from "./Avisos";

/** Se prende con NEXT_PUBLIC_MODO_DEMO=1 mientras el sistema se muestra con
 *  datos inventados. Al cargar los reales se apaga y se vuelve a publicar. */
const DEMO = process.env.NEXT_PUBLIC_MODO_DEMO === "1";

type IconProps = { className?: string };

/* Iconos de línea, dibujados acá para no arrastrar una librería entera por
   cuatro formas. Heredan el color del texto. */
const Ico = {
  inicio: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <path
        d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  ),
  remitos: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <path
        d="M5 2.5h10v15l-2.5-1.5L10 17.5 7.5 16 5 17.5v-15Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  ),
  productos: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <path
        d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M3 6.5 10 10l7-3.5M10 10v7"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ingresos: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <path
        d="M10 3v8m0 0 3-3m-3 3-3-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  ),
  clientes: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <circle cx="7.5" cy="7" r="2.75" stroke="currentColor" />
      <path
        d="M3 16.5c0-2.2 2-3.75 4.5-3.75s4.5 1.55 4.5 3.75"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d="M13.5 5.5a2.5 2.5 0 0 1 0 4.5M15 16.5c0-1.6-.7-2.8-1.9-3.4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  ),
  proveedores: (p: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" {...p}>
      <path
        d="M2.5 7.5h9v7h-9v-7Zm9 2.5h3l2 2.5v2h-5v-4.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="15.5" r="1.4" stroke="currentColor" />
      <circle cx="14" cy="15.5" r="1.4" stroke="currentColor" />
    </svg>
  ),
};

const LINKS = [
  { href: "/", label: "Inicio", icono: Ico.inicio },
  { href: "/remitos", label: "Remitos", icono: Ico.remitos },
  { href: "/productos", label: "Productos y stock", icono: Ico.productos },
  { href: "/clientes", label: "Clientes", icono: Ico.clientes },
  { href: "/proveedores", label: "Proveedores", icono: Ico.proveedores },
  { href: "/ingresos", label: "Ingreso de mercadería", icono: Ico.ingresos },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { usuario, salir, cargando, errorCarga } = useStore();
  const pathname = usePathname();

  if (cargando) {
    return (
      <div className="text-muted flex min-h-screen items-center justify-center text-sm">
        Cargando…
      </div>
    );
  }

  if (!usuario) return <Login />;

  const seccion =
    LINKS.find((l) =>
      l.href === "/" ? pathname === "/" : pathname.startsWith(l.href),
    )?.label ?? "";

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print bg-panel md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <EscudoClaro className="h-9 w-auto" />
          <span className="titulo text-panel-text-fuerte text-[15px] leading-tight">
            Grupo Barba
          </span>
        </Link>

        <div className="px-4 pb-4">
          <Link
            href="/remitos/nuevo"
            className="bg-acento text-ink hover:bg-acento-fuerte flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
          >
            <span className="text-base leading-none">+</span>
            Nuevo remito
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:mt-2 md:flex-col md:overflow-visible md:pb-0">
          {LINKS.map((l) => {
            const activo =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const Icono = l.icono;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={activo ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition ${
                  activo
                    ? "bg-panel-item text-panel-text-fuerte font-medium"
                    : "text-panel-text hover:bg-panel-item/60 hover:text-panel-text-fuerte"
                }`}
              >
                {/* El amarillo marca dónde estás parado: es el único lugar
                    donde aparece en la navegación. */}
                {activo && (
                  <span className="bg-acento absolute top-1/2 -left-4 hidden h-5 w-1 -translate-y-1/2 rounded-r md:block" />
                )}
                <Icono
                  className={`h-[18px] w-[18px] shrink-0 ${activo ? "text-acento" : "text-panel-text"}`}
                />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-panel-linea mt-auto hidden border-t px-5 py-4 md:block">
          <p className="text-panel-text text-xs leading-relaxed">
            Grupo Barba · sistema interno
          </p>
        </div>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:ml-64">
        {DEMO && (
          <div className="no-print bg-acento text-ink px-5 py-2 text-center text-[13px] font-medium lg:px-8">
            Estás viendo <b>datos de ejemplo</b> para probar el sistema. Los
            productos, clientes y remitos son inventados: nada de esto es
            información real de Grupo Barba.
          </div>
        )}
        <header className="no-print border-line bg-surface/90 sticky top-0 z-20 border-b backdrop-blur">
          <div className="flex items-center gap-4 px-5 py-3 lg:px-8">
            <h1 className="titulo hidden shrink-0 truncate text-[17px] lg:block">
              {seccion}
            </h1>

            <div className="min-w-0 flex-1 lg:pl-6">
              <Buscador />
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-[13px] font-medium">{usuario.nombre}</div>
                <div className="text-faint text-[11px]">{usuario.rol}</div>
              </div>
              <span className="bg-canvas text-muted border-line flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold">
                {usuario.nombre.slice(0, 1).toUpperCase()}
              </span>
              <button
                onClick={() => void salir()}
                className="border-line text-muted hover:border-ink hover:text-ink rounded-md border px-2.5 py-1.5 text-xs transition"
              >
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* Que no se pudieron traer los datos: no es de una operacion, es de
            toda la pantalla, y queda arriba hasta que la carga ande. */}
        {errorCarga && (
          <div
            role="alert"
            className="no-print border-alerta/30 bg-alerta-soft text-alerta mx-auto mt-5 flex w-full max-w-6xl items-start gap-3 rounded-lg border px-4 py-3 text-sm lg:px-5"
          >
            <span className="flex-1">{errorCarga}</span>
          </div>
        )}

        <Avisos />

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
