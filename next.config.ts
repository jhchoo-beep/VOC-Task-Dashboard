import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
  },
  // 프레이밍 관련 헤더를 의도적으로 보내지 않는다.
  // Next.js는 기본적으로 X-Frame-Options/CSP를 추가하지 않으므로, 별도 설정이 없으면
  // /embed/* 는 어떤 컨텍스트(노션 웹/데스크톱 앱의 샌드박스 iframe = null origin 포함)에서도 임베드된다.
  // 접근 통제는 middleware의 ?key= 토큰이 담당한다.
}
export default nextConfig
