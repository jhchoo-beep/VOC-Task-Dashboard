// STAY VOC 2.0 수행과제 — B 관제 콘솔형. 1.0(/tasks) 기능은 그대로, 디자인만 2.0.
// 주소: ?month= 달, ?id=(또는 ?task=) 고른 과제, ?branch= ?status= 처음 필터, ?new=1&branch=&title= 새 수행과제 입력 열기.
// 🔴 라우트 캐시를 걸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import TasksView from '@/components/v2/tasks/TasksView'

export default function TasksPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <TasksView searchParams={searchParams} />
}
