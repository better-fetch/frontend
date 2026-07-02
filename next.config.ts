import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Fly.io Docker image.
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.betterfetch.co" }],
        destination: "https://betterfetch.co/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // MCP clients (claude.ai, Cowork) fetch serverInfo icons from the
        // browser on their own origin — without CORS the fetch is blocked
        // and the connector shows no icon.
        source: "/:file(icon-192\\.png|icon-512\\.png|favicon\\.ico|logo\\.svg|logo-white\\.svg)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
