import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KLIPAPP — converse, grave e publique",
    short_name: "KLIPAPP",
    id: "/",
    description:
      "Videochamadas privadas, gravação de alta qualidade e edição de clipes para publicar nas redes sociais.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B1020",
    theme_color: "#7668FF",
    orientation: "any",
    lang: "pt-BR",
    dir: "ltr",
    prefer_related_applications: false,
    categories: ["photo", "video", "social", "productivity"],
    shortcuts: [
      {
        name: "Abrir o editor",
        short_name: "Editor",
        description: "Edite vídeos e monte clipes no KLIPAPP Studio.",
        url: "/?editor=1",
      },
      {
        name: "Criar uma sala",
        short_name: "Nova sala",
        description: "Inicie uma gravação ou videochamada privada.",
        url: "/",
      },
    ],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
