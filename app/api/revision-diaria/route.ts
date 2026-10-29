/**
 * La revisión que corre sola todas las noches: el cron de Vercel (vercel.json)
 * la llama a las 22:00 de Argentina, cuando el equipo ya no trabaja, y a
 * Lautaro le llega un mail con la coherencia de la base, la actividad del día
 * y el estado del sistema. SOLO LEE (lib/revision.ts). Hasta el 28-oct-2026
 * era semanal (/api/revision-semanal, los sábados).
 *
 * Variables de Vercel (solo Production):
 *   CRON_SECRET       Vercel la manda sola como «Bearer» en cada llamada del
 *                     cron; sin ella cualquiera podría dispararla.
 *   REVISION_USUARIO  con qué cuenta del equipo lee (federico, claudia o roxana;
 *                     todas ven lo mismo). Sin definir, federico.
 *   REVISION_CLAVE    la clave de esa cuenta. Si se le cambia la clave a esa
 *                     persona, hay que cambiarla acá también (28-oct: la de
 *                     federico estaba vieja y el mail llegó «no pudo correr»).
 *   RESEND_API_KEY    para mandar el mail (https://resend.com).
 *   REVISION_MAIL     a quién le llega.
 */
import { createClient } from "@supabase/supabase-js";
import { revisar, comoTexto, resumen } from "@/lib/revision";

// Puede esperar hasta medio minuto si la sesión nace «en el futuro» (ver lib/revision.ts).
export const maxDuration = 120;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`)
    return new Response("No autorizado", { status: 401 });

  let asunto: string;
  let cuerpo: string;
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const usuario = (process.env.REVISION_USUARIO || "federico").trim().toLowerCase();
    const { error } = await sb.auth.signInWithPassword({
      email: `${usuario}@barba.local`,
      password: process.env.REVISION_CLAVE ?? "",
    });
    if (error)
      throw new Error(
        `No pude entrar como ${usuario}: ${error.message}. Revisar REVISION_USUARIO y REVISION_CLAVE en Vercel (Settings → Environment Variables).`,
      );
    // Recién emitido, la base a veces lo rechaza con «JWT issued at future».
    await new Promise((r) => setTimeout(r, 3000));

    const r = await revisar(sb, 1);
    await sb.auth.signOut();
    const a = r.actividad;
    const dia = r.fecha.toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "numeric",
      month: "numeric",
    });
    const hoy = `${a.emitidos} remito(s), ${a.ingresos} ingreso(s)`;
    asunto =
      r.duros > 0
        ? `⚠ Barba ${dia}: ${r.duros} problema(s) en la base, no tocar datos`
        : `Barba ${dia}: base coherente · ${hoy}${r.blandos ? ` · ${r.blandos} para revisar` : ""}`;
    cuerpo = `${resumen(r)}\n\n${comoTexto(r)}`;
  } catch (e) {
    asunto = "⚠ Barba: la revisión diaria no pudo correr";
    cuerpo = `${e instanceof Error ? e.message : String(e)}\n\nCorrerla a mano: npx tsx scripts/revisar_datos.ts --dias 1`;
  }

  const enviado = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Revisión Barba <onboarding@resend.dev>",
      to: [process.env.REVISION_MAIL],
      subject: asunto,
      text: cuerpo,
    }),
  });
  if (!enviado.ok)
    return new Response(`No se pudo mandar el mail: ${await enviado.text()}`, { status: 502 });
  return new Response(asunto);
}
