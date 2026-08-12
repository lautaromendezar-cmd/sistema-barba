"use client";

import { useState } from "react";
import { USUARIOS } from "@/lib/types";
import { useStore } from "@/lib/store";

export function Login() {
  const { entrar } = useStore();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const u = USUARIOS.find(
      (x) => x.usuario === usuario.trim().toLowerCase(),
    );
    if (!u || clave !== "demo") {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    entrar(u);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-wine">
            <span className="serif text-xl font-semibold text-white">B</span>
          </div>
          <h1 className="serif text-2xl font-semibold">Grupo Barba</h1>
          <p className="mt-1 text-sm text-muted">Remitos y stock</p>
        </div>

        <form
          onSubmit={enviar}
          className="rounded-lg border border-line bg-surface p-6 shadow-sm"
        >
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Usuario
          </label>
          <input
            autoFocus
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value);
              setError("");
            }}
            className="mb-4 w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-wine"
            placeholder="nahiara"
          />

          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Contraseña
          </label>
          <input
            type="password"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value);
              setError("");
            }}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-wine"
            placeholder="••••"
          />

          {error && (
            <p className="mt-3 text-sm text-wine">{error}</p>
          )}

          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-wine px-4 py-2.5 text-[15px] font-medium text-white transition hover:bg-wine-ink"
          >
            Entrar
          </button>
        </form>

        <div className="mt-5 rounded-md border border-line bg-amber-soft p-4 text-[13px] leading-relaxed text-muted">
          <p className="mb-1 font-semibold text-amber-ink">Demo</p>
          Usuarios: <b>nahiara</b>, <b>carla</b> o <b>federico</b>.
          Contraseña: <b>demo</b>. En el sistema real el acceso lo maneja
          Supabase y las cuentas las crea el administrador; no hay registro
          público.
        </div>
      </div>
    </div>
  );
}
