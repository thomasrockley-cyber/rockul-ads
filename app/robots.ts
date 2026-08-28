import type { MetadataRoute } from "next";

// Private, single-user internal tool — never meant to be crawled or
// indexed at all (see also the noindex meta tag in app/layout.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
