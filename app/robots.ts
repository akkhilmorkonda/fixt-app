import type { MetadataRoute } from "next";

// The platform is private: keep every page out of search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
