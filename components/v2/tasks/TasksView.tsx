// STAY VOC 2.0 수행과제 — 로그인 화면(/v2/tasks)과 읽기 전용 노션 임베드(/embed/v2/tasks)가 같이 쓰는 서버 조각.
// 데이터는 1.0 과 같은 lib/pageData getTasksProps(한 달치)를 그대로 쓴다. 쓰기는 1.0 API(app/api/tasks/**, app/api/trigger-links).
import { getTasksProps } from '@/lib/pageData'
import { supabase } from '@/lib/supabase'
import { ALL, BRANCHES, type Scope } from '@/lib/v2/metrics'
import { ALL_STATUS, TASK_STATUSES, prefillFrom, type Task } from '@/lib/v2/tasks'
import TasksConsole from './TasksConsole'

type SP = { [k: string]: string | string[] | undefined }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function TasksView({ searchParams, embed = false }: { searchParams: Promise<SP>; embed?: boolean }) {
  const sp = await searchParams
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)

  // 고를 과제: ?id= (2.0 리포트 「등록 수행과제」), ?task= (1.0 주소·슬랙 알림 링크)
  const raw = str('id') ?? str('task')
  const pick = raw && UUID.test(raw) ? raw : null

  // 달이 없으면 고를 과제의 달로 연다(과제 목록이 한 달치라, 다른 달 과제는 목록에 없으므로)
  let month = str('month')
  if (!month && pick) {
    const { data } = await supabase.from('tasks').select('task_month').eq('id', pick).maybeSingle()
    month = (data?.task_month as string | null | undefined) ?? undefined
  }

  let props: Awaited<ReturnType<typeof getTasksProps>>
  try {
    props = await getTasksProps(month, pick ?? undefined)
  } catch (e) {
    console.error('v2 수행과제 조회 실패', (e as Error).message)
    return <main className="v2-console"><div className="empty">수행과제를 읽지 못했습니다.</div></main>
  }

  const b = str('branch')
  const st = str('status')
  return (
    <TasksConsole
      key={props.currentMonth}
      tasks={props.tasks as Task[]}
      months={props.months}
      currentMonth={props.currentMonth}
      initialSel={pick}
      initialBranch={b && (BRANCHES as readonly string[]).includes(b) ? (b as Scope) : ALL}
      initialStatus={st && (TASK_STATUSES as readonly string[]).includes(st) ? st : ALL_STATUS}
      prefill={embed ? null : prefillFrom({ new: str('new'), branch: b, title: str('title') }, BRANCHES)}
      embed={embed}
      embedKey={embed ? str('key') ?? null : null}
    />
  )
}
