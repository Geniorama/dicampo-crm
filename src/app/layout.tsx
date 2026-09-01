import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CRM Dicampo",
    template: "%s · CRM Dicampo",
  },
  description:
    "Gestión comercial, pedidos, inventario y despachos de Dicampo, pulpa de fruta 100% natural.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
