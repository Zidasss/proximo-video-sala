import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description: "Condições de uso das salas, gravações, editor e integrações da KLIPAPP.",
  alternates: { canonical: "/termos" },
};

export default function TermsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
