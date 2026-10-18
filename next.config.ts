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
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
