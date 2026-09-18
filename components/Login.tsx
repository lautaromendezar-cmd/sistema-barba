"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export function Login() {
  const { entrar } = useStore();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (entrando) return;
    setEntrando(true);
    setError("");
    const problema = await entrar(usuario, clave);
    if (problema) {
      setError(problema);
      setEntrando(false);
    }
    // Si entro bien, el StoreProvider cambia de pantalla solo.
  }

  return (
    <div className="bg-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-acento mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <span className="titulo text-ink text-xl font-bold">B</span>
          </div>
          <h1 className="titulo text-2xl">Grupo Barba</h1>
          <p className="text-muted mt-1 text-sm">Remitos y stock</p>
        </div>

        <form
          onSubmit={enviar}
          className="border-line bg-surface rounded-xl border p-6 shadow-sm"
        >
          <label
            htmlFor="usuario"
            className="text-muted mb-1 block text-xs font-semibold tracking-wide uppercase"
          >
            Usuario
          </label>
          <input
            id="usuario"
            autoFocus
            autoComplete="username"
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value);
              setError("");
            }}
            className="border-line focus:border-ink mb-4 w-full rounded-md border bg-white px-3 py-2 text-[15px] outline-none"
            placeholder="claudia"
          />

          <label
            htmlFor="clave"
            className="text-muted mb-1 block text-xs font-semibold tracking-wide uppercase"
          >
            Contraseña
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value);
              setError("");
            }}
            className="border-line focus:border-ink w-full rounded-md border bg-white px-3 py-2 text-[15px] outline-none"
            placeholder="••••••••"
          />

          {error && <p className="text-alerta mt-3 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={entrando || !usuario || !clave}
            className="bg-ink hover:bg-ink-hover mt-5 w-full rounded-md px-4 py-2.5 text-[15px] font-medium text-white transition disabled:opacity-40"
          >
            {entrando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="text-faint mt-5 text-center text-[13px] leading-relaxed">
          Las cuentas las crea el administrador.
          <br />
          No hay registro público.
        </p>
      </div>
    </div>
  );
}
