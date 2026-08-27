import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./styles/klipapp.css";
import "./styles/klip-pure.css";

import { ThemeScript } from "../components/theme/ThemeScript";
import accessibilityStyles from "../components/theme/Accessibility.module.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.klipapp.com.br"),
  title: {
    default: "KLIPAPP — converse, grave e publique",
    template: "%s | KLIPAPP",
  },
  description:
    "Videochamadas privadas, gravação de alta qualidade e edição de clipes para publicar nas redes sociais.",
  applicationName: "KLIPAPP",
  category: "technology",
  creator: "KLIPAPP",
  publisher: "KLIPAPP",
  keywords: ["editor de vídeo", "videochamada", "gravação", "clipes", "reels", "shorts"],
  referrer: "origin-when-cross-origin",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "KLIPAPP",
    title: "KLIPAPP — converse, grave e publique",
    description:
      "Videochamadas privadas, gravação de alta qualidade e edição de clipes para publicar nas redes sociais.",
  },
  twitter: {
    card: "summary",
    title: "KLIPAPP — converse, grave e publique",
    description:
      "Videochamadas privadas, gravação de alta qualidade e edição de clipes para publicar nas redes sociais.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#17181A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" dir="ltr" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        <a className={accessibilityStyles.skipLink} href="#conteudo-principal">
          Pular para o conteúdo
        </a>
        <div id="conteudo-principal" className={accessibilityStyles.content} tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
