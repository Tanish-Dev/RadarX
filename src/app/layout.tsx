import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-inter", display: "swap", fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"], adjustFontFallback: true });
// ref-01's display type is a light, slightly tight grotesk — Inter 300/400 matches it closely

const DESCRIPTION = "Free, live radar for internships, new-grad and research roles the moment they're posted — plus tech news, world signals and a live map.";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "RadarX", template: "%s" },
  description: DESCRIPTION,
  applicationName: "RadarX",
  openGraph: { type: "website", siteName: "RadarX", title: "RadarX — opportunities the moment they're posted", description: DESCRIPTION },
  twitter: { card: "summary", title: "RadarX", description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0A0A0B" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

/** Set the theme class before paint: saved choice, else dark (the ref-01 look is the default). */
const themeScript = `try{var t=localStorage.getItem('rx-theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // per-request CSP nonce (middleware)
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* browsers hide nonce attributes from the DOM (nonce=""), so hydration would always "mismatch" here */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
