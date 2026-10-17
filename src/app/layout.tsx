import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RogueWeb: Echoes of the Grid",
  description: "Explora mazmorras y enfréntate a los centinelas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
