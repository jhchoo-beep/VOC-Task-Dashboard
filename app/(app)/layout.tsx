import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        userName={session.user?.name ?? ''}
        userEmail={session.user?.email ?? ''}
        userImage={session.user?.image ?? ''}
      />
      <main className="main-content" style={{ flex: 1, minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}
