"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Login } from "./Login";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/remitos", label: "Remitos" },
  { href: "/productos", label: "Productos y stock" },
  { href: "/ingresos", label: "Ingreso de mercadería" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { usuario, salir, reiniciarDemo } = useStore();
  const pathname = usePathname();

  if (!usuario) return <Login />;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wine text-sm font-semibold text-white">
              B
            </span>
            <span className="serif text-lg leading-none font-semibold">
              Grupo Barba
            </span>
          </Link>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto">
            {LINKS.map((l) => {
              const activo =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition ${
                    activo
                      ? "bg-wine-soft font-medium text-wine"
                      : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{usuario.nombre}</div>
              <div className="text-xs text-faint">{usuario.rol}</div>
            </div>
            <button
              onClick={salir}
              className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-wine hover:text-wine"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

      <footer className="no-print mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pt-2 pb-10 text-xs text-faint">
        <span>
          Demo · los datos se guardan solo en este navegador, no hay servidor.
        </span>
        <button
          onClick={() => {
            if (confirm("¿Volver la demo al estado inicial?")) reiniciarDemo();
          }}
          className="rounded border border-line px-2 py-1 transition hover:border-wine hover:text-wine"
        >
          Reiniciar demo
        </button>
      </footer>
    </div>
  );
}
