import { renderToBuffer } from "@react-pdf/renderer";
import { RemitoPdf } from "@/components/RemitoPdf";
import { traerRemitoPublico } from "@/lib/remitoPublico";

export async function GET(req: Request, ctx: RouteContext<"/r/[codigo]/pdf">) {
  const { codigo } = await ctx.params;
  const remito = await traerRemitoPublico(codigo);
  // La página da el 404 con los WhatsApp.
  if (!remito) return Response.redirect(new URL(`/r/${codigo}`, req.url));

  const logo = await fetch(new URL("/marca/grupo-barba.png", req.url));
  const pdf = await renderToBuffer(
    <RemitoPdf remito={remito} logo={Buffer.from(await logo.arrayBuffer())} />,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Remito ${remito.numero} Grupo Barba.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
