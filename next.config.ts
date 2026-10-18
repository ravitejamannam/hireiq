import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /**
   * pdf-parse bundles pdfjs-dist, which resolves its worker via
   * filesystem paths that break when bundled. Keep it external so it
   * loads from node_modules at runtime (T97 resume text extraction).
   */
  serverExternalPackages: ["pdf-parse", "unpdf", "tesseract.js", "@napi-rs/canvas"],
  async redirects() {
    return [
      {
        source: "/c/:companySlug",
        destination: "/careers/:companySlug",
        permanent: true,
      },
    ];
  },
  async headers() {
    const shared = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [
      {
        source: "/embed/:path*",
        headers: [
          ...shared,
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ...shared,
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
