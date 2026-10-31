import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });
import { Marco } from "@/components/Marco";

export const metadata: Metadata = {
  title: "Grupo Barba · Remitos y Stock",
  description: "Sistema interno de remitos y control de stock.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full">
        <Marco>{children}</Marco>
      </body>
    </html>
  );
}
