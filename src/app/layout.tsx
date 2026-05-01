import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Portal de Permutas e FT",
  description:
    "Portal mobile-first para controlar permutas e folgas trabalhadas com validações fortes e reconciliação automática com a Nexti.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[color:var(--surface-100)] font-sans text-[color:var(--ink-900)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
