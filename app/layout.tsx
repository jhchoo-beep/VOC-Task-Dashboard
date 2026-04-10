import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MGRV VOC',
  description: 'OTA 리뷰 & 수행과제 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
