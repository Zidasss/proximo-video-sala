import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Perfil e integrações",
  description: "Gerencie seu perfil KLIPAPP e conecte os canais usados para publicar seus vídeos.",
  alternates: { canonical: "/perfil" },
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
