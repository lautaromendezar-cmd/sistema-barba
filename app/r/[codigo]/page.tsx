import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RemitoPapel } from "@/components/RemitoPapel";
import { traerRemitoPublico } from "@/lib/remitoPublico";

type Props = { params: Promise<{ codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const remito = await traerRemitoPublico(codigo);
  const titulo = remito ? `Remito ${remito.numero}` : "Remito";
  return {
    title: `${titulo} · Grupo Barba`,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: "Grupo Barba · Distribuidora de vinos",
      images: ["/marca/grupo-barba.png"],
    },
  };
}

export default async function RemitoParaElCliente({ params }: Props) {
  const { codigo } = await params;
  const remito = await traerRemitoPublico(codigo);
  if (!remito) notFound();
  const c = remito.cliente;

  return (
    <main className="bg-canvas min-h-screen px-3 py-4 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="no-print mb-3 flex justify-end">
          <a
            href={`/r/${codigo}/pdf`}
            className="bg-ink hover:bg-ink-hover rounded-md px-4 py-2.5 text-sm font-medium text-white transition"
          >
            Descargar PDF
          </a>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-8 print:rounded-none print:p-0 print:shadow-none">
          <RemitoPapel
            remito={remito}
            cliente={
              c && {
                numero: c.numero,
                apodo: c.apodo ?? "",
                razonSocial: c.razon_social ?? "",
                direccion: c.direccion ?? "",
                localidad: c.localidad ?? "",
                telefono: c.telefono ?? "",
                notas: c.notas ?? "",
              }
            }
          />
        </div>
      </div>
    </main>
  );
}
