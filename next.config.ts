import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El commit publicado, para el número de versión (ver lib/version.ts).
  // Vercel lo pone al compilar; en local queda vacío.
  env: {
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
};

export default nextConfig;
