// 2.0 수행과제 노션 임베드 — 읽기 전용(등록·수정·삭제·상태 변경·진행 사항 입력·트리거 링크 편집을 숨김).
export const dynamic = 'force-dynamic'

import TasksView from '@/components/v2/tasks/TasksView'

export default function EmbedTasksPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <TasksView searchParams={searchParams} embed />
}
