import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdf-parse bundles pdfjs-dist, which resolves its worker via
   * filesystem paths that break when bundled. Keep it external so it
   * loads from node_modules at runtime (T97 resume text extraction).
   */
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
