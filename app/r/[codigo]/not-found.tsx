import { IconoWhatsApp } from "@/components/IconoWhatsApp";
import { telefonoWhatsApp } from "@/lib/whatsapp";

const CONTACTOS = ["1165047011", "1172399523"];

export default function RemitoNoEncontrado() {
  return (
    <main className="bg-canvas flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/grupo-barba.png"
          alt="Grupo Barba · Distribuidora de vinos"
          width={834}
          height={508}
          className="mx-auto h-24 w-auto"
        />
        <h1 className="titulo mt-5 text-xl font-semibold">
          No encontramos este remito
        </h1>
        <p className="text-muted mt-2 text-sm">
          Revisá que el link esté completo o escribinos por WhatsApp.
        </p>
        <div className="mt-6 space-y-2">
          {CONTACTOS.map((tel) => (
            <a
              key={tel}
              href={`https://wa.me/${telefonoWhatsApp(tel)}`}
              target="_blank"
              rel="noopener"
              className="tnum flex items-center justify-center gap-2 rounded-md bg-[#128C4A] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0E7239]"
            >
              <IconoWhatsApp className="size-4 shrink-0" />
              {`${tel.slice(0, 2)} ${tel.slice(2, 6)}-${tel.slice(6)}`}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
