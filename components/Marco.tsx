"use client";

import { usePathname } from "next/navigation";
import { StoreProvider } from "@/lib/store";
import { Shell } from "./Shell";

/** El link del remito lo abre un cliente sin cuenta: ni login, ni menú, ni store. */
export function Marco({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/r/")) return children;
  return (
    <StoreProvider>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}
