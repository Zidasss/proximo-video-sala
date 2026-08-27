import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacidade", "/termos"],
      disallow: ["/api/", "/auth/", "/perfil"],
    },
    sitemap: "https://www.klipapp.com.br/sitemap.xml",
    host: "https://www.klipapp.com.br",
  };
}
