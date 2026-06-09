// 임베드 전용 레이아웃: 사이드바·인증 없음 (접근 통제는 middleware의 토큰 게이트가 담당).
// 노션 등 외부 페이지의 iframe 안에서 전체폭으로 렌더된다.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', width: '100%' }}>
      {children}
    </main>
  )
}
