import type { NextConfig } from "next";

const apiBackend =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://localhost:8080";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
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
