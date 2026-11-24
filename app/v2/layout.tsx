// STAY VOC 2.0 — 1.0(app/(app))과 따로 도는 셸. 로그인·환경 변수·API는 1.0과 같이 쓴다.
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import V2Shell from '@/components/v2/V2Shell'

export const metadata = { title: 'STAY VOC 2.0' }

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return <V2Shell>{children}</V2Shell>
}
