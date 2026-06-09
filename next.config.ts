import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
  },
  // /embed/* 경로만 노션 등에서 iframe 임베드 허용 (나머지는 기본 정책 유지)
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.notion.so https://*.notion.site https://www.notion.so",
          },
        ],
      },
    ]
  },
}
export default nextConfig
