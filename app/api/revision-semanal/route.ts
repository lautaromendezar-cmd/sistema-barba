/**
 * La revisión de coherencia que corre sola: el cron de Vercel (vercel.json) la
 * llama los sábados a la mañana, cuando el equipo no trabaja, y el resultado
 * le llega a Lautaro por mail. SOLO LEE (lib/revision.ts).
 *
 * Variables de Vercel (solo Production):
 *   CRON_SECRET       Vercel la manda sola como «Bearer» en cada llamada del
 *                     cron; sin ella cualquiera podría dispararla.
 *   REVISION_CLAVE    la clave de federico (la cuenta con la que lee). Si se le
 *                     cambia la clave a federico, hay que cambiarla acá también.
 *   RESEND_API_KEY    para mandar el mail (https://resend.com).
 *   REVISION_MAIL     a quién le llega.
 */
import { createClient } from "@supabase/supabase-js";
import { revisar, comoTexto, resumen } from "@/lib/revision";

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
    const { error } = await sb.auth.signInWithPassword({
      email: "federico@barba.local",
      password: process.env.REVISION_CLAVE ?? "",
    });
    if (error) throw new Error(`No pude entrar como federico: ${error.message}`);
    // Recién emitido, la base a veces lo rechaza con «JWT issued at future».
    await new Promise((r) => setTimeout(r, 3000));

    const r = await revisar(sb);
    await sb.auth.signOut();
    asunto =
      r.duros > 0
        ? `⚠ Barba: ${r.duros} problema(s) en la base, no tocar datos`
        : `Barba: base coherente${r.blandos ? ` · ${r.blandos} punto(s) para revisar` : ""}`;
    cuerpo = `${resumen(r)}\n\n${comoTexto(r)}`;
  } catch (e) {
    asunto = "⚠ Barba: la revisión semanal no pudo correr";
    cuerpo = `${e instanceof Error ? e.message : String(e)}\n\nCorrerla a mano: npx tsx scripts/revisar_datos.ts`;
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
