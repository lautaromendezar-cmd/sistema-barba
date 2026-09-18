"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Login } from "./Login";

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
};

const LINKS = [
  { href: "/", label: "Inicio", icono: Ico.inicio },
  { href: "/remitos", label: "Remitos", icono: Ico.remitos },
  { href: "/productos", label: "Productos y stock", icono: Ico.productos },
  { href: "/ingresos", label: "Ingreso de mercadería", icono: Ico.ingresos },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { usuario, salir, cargando } = useStore();
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
      <aside className="no-print border-line bg-surface md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col md:border-r">
        <Link
          href="/"
          className="border-line flex items-center gap-2.5 border-b px-5 py-4 md:border-b-0"
        >
          <span className="bg-acento text-ink flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
            B
          </span>
          <span className="titulo text-[15px] leading-tight">Grupo Barba</span>
        </Link>

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
                className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
                  activo
                    ? "bg-canvas text-ink font-medium"
                    : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {/* El amarillo marca dónde estás parado: es el único lugar
                    donde aparece en la navegación. */}
                {activo && (
                  <span className="bg-acento absolute top-1/2 -left-3 hidden h-5 w-1 -translate-y-1/2 rounded-r md:block" />
                )}
                <Icono
                  className={`h-[18px] w-[18px] shrink-0 ${activo ? "text-ink" : "text-faint"}`}
                />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-line mt-auto hidden border-t px-5 py-4 md:block">
          <p className="text-faint text-xs leading-relaxed">
            Grupo Barba · sistema interno
          </p>
        </div>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <header className="no-print border-line bg-surface/90 sticky top-0 z-20 border-b backdrop-blur">
          <div className="flex items-center gap-4 px-5 py-3.5 lg:px-8">
            <h1 className="titulo truncate text-[17px]">{seccion}</h1>

            <div className="ml-auto flex items-center gap-3">
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

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
