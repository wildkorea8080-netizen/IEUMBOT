import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pnpm 모노레포에서 "Collecting build traces" 단계가 심링크 구조 전체를 훑다
  // 실패하는 것을 막기 위해 트레이싱 루트를 저장소 루트로 고정 (apps/web 기준 2단계 위).
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  async rewrites() {
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.WEB_PUBLIC_API_BASE_URL ??
      "http://localhost:8000/api";
    const normalized = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    return [
      {
        source: "/backend-api/:path*",
        destination: `${normalized}/:path*`,
      },
    ];
  }
};

export default nextConfig;
