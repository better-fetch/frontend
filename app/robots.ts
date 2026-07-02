import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/keys", "/api/", "/auth/"],
    },
    sitemap: "https://betterfetch.co/sitemap.xml",
    host: "https://betterfetch.co",
  };
}
