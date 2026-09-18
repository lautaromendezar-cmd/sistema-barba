import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Supabase Auth necesita un email, pero acá se entra escribiendo "claudia".
 * El usuario nunca ve esta direccion: es un identificador interno y el dominio
 * no tiene que existir ni recibir correo.
 */
export const DOMINIO_INTERNO = "barba.local";

export function emailDe(usuario: string) {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_INTERNO}`;
}
