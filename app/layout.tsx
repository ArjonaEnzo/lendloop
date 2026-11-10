import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible, Atkinson_Hyperlegible_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});
// Same family as the body text, used only for what a workshop would stamp or print: dates, bin codes, IDs.
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson-mono",
  // Next has no fallback metrics for this family yet; use the system mono instead of a guessed one.
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${atkinson.variable} ${atkinsonMono.variable}`}>
      <body className="min-h-screen antialiased">
        <ClerkProvider>
          <ConvexClientProvider>
            <Header />
            <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">{children}</main>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
