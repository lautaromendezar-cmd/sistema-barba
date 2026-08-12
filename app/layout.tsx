import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Grupo Barba · Remitos y Stock",
  description: "Sistema interno de remitos y control de stock — demo",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
