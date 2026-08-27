import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Saiba como a KLIPAPP trata dados, gravações, integrações e preferências.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
