/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
