import path from "node:path";
import type { NextConfig } from "next";

const apiBackend =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBackend}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${apiBackend}/health`,
      },
    ];
  },
};

export default nextConfig;
