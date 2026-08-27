import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.klipapp.com.br";
  const lastModified = new Date();

  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacidade`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/termos`, lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];
}
