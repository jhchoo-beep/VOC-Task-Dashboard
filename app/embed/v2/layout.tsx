// 2.0 노션 임베드 — 로그인 대신 middleware 의 ?key= 토큰으로만 열린다(app/embed/layout.tsx 안쪽).
import V2Shell from '@/components/v2/V2Shell'

export const metadata = { title: 'STAY VOC 2.0' }

export default function EmbedV2Layout({ children }: { children: React.ReactNode }) {
  return <V2Shell>{children}</V2Shell>
}
