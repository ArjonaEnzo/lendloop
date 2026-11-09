import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible } from "next/font/google";
import { Header } from "@/components/Header";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${atkinson.variable}`}>
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
