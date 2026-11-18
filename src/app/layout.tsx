import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-inter", display: "swap", fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"], adjustFontFallback: true });
// ref-01's display type is a light, slightly tight grotesk — Inter 300/400 matches it closely

export const metadata: Metadata = {
  title: "RadarX",
  description: "Internships, new-grad and research roles the moment they're posted.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0A0A0B" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

/** Set the theme class before paint: saved choice, else dark (the ref-01 look is the default). */
const themeScript = `try{var t=localStorage.getItem('rx-theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
