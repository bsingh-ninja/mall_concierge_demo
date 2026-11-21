import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "800"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "Dalma Mall Concierge",
  description: "Indoor map with a planned route, live offers and crowd-aware rerouting, plus the mall operator console. Demo by NinjaTech.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#eef2f3" };

// Apply the saved theme before first paint, so Dusk never flashes Day.
const themeScript = `try{var t=localStorage.getItem("mc-theme");if(t==="dusk")document.documentElement.dataset.theme="dusk"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className={`${body.variable} ${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
