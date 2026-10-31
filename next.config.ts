import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El commit publicado, para el número de versión (ver lib/version.ts).
  // Vercel lo pone al compilar; en local queda vacío.
  env: {
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  // comprobantes.* es solo para los links de remitos que reciben los clientes:
  // cualquier otra cosa va al sistema.
  redirects: async () =>
    ["/", "/:ruta((?!r/|_next/|marca/|favicon).+)"].map((source) => ({
      source,
      has: [{ type: "host", value: "comprobantes.grupobarba.com.ar" }],
      destination: "https://sistema.grupobarba.com.ar/:ruta*",
      permanent: false,
    })),
};

export default nextConfig;
