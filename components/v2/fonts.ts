// 2.0 글꼴. next/font/local 은 모듈 최상단에서 불러야 해서 따로 둔다.
import localFont from 'next/font/local'

export const sans = localFont({
  src: [
    { path: '../../public/fonts/Pretendard-Regular.woff2', weight: '400' },
    { path: '../../public/fonts/Pretendard-Medium.woff2', weight: '500' },
    { path: '../../public/fonts/Pretendard-SemiBold.woff2', weight: '600' },
    { path: '../../public/fonts/Pretendard-Bold.woff2', weight: '700' },
  ],
  variable: '--v2-sans',
  display: 'swap',
})

// 숫자 = G마켓 산스(MGRV 규칙). 숫자와 기호만 이 글꼴로 그린다.
export const num = localFont({
  src: [
    { path: '../../app/v2/_fonts/GmarketSans-Medium.woff2', weight: '400 600' },
    { path: '../../app/v2/_fonts/GmarketSans-Bold.woff2', weight: '700' },
  ],
  variable: '--v2-num',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0025, U+002B-002F, U+0030-003A, U+2212' }],
})

