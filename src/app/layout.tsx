import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Praca na miarę",
  description: "Znajdź pracę dopasowaną do Ciebie — bez zgadywania, jakie stanowisko wpisać.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
