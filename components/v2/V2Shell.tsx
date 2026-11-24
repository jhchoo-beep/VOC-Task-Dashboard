// 2.0 셸: 색 테마 루트 + 글꼴 + 헤더. 로그인 화면(app/v2)과 노션 임베드(app/embed/v2)가 같이 쓴다.
import V2Header from './V2Header'
import { num, sans } from './fonts'
import '@/app/v2/v2.css'

// 첫 그림 전에 색을 정한다(다크가 기본, 오른쪽 위 버튼으로 바꾼 값은 이 브라우저에만 남는다)
const THEME_SCRIPT = `try{var t=localStorage.getItem('voc2-theme');document.getElementById('v2root').setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){}`

export default function V2Shell({ children, header = true }: { children: React.ReactNode; header?: boolean }) {
  return (
    <div id="v2root" className={`v2 ${sans.variable} ${num.variable}`} data-theme="dark" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {header && <V2Header />}
      {children}
    </div>
  )
}
