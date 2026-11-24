// 수행과제 2.0 화면 조각(표시만). 색은 v2.css 변수, 클래스는 app/v2/tasks/tasks.css 의 .tk-*
const ST_CLASS: Record<string, string> = { 진행중: 'doing', 시작전: 'todo', 완료: 'done', 보류: 'hold' }
const SEV_CLASS: Record<string, string> = { Critical: 'c', High: 'h', Medium: 'm', Low: 'l' }

export function StatusPill({ status }: { status: string }) {
  return <span className={`tk-st ${ST_CLASS[status] ?? 'todo'}`}>{status}</span>
}

export function SevPill({ severity }: { severity: string | null }) {
  if (!severity) return null
  return <span className={`tk-sev ${SEV_CLASS[severity] ?? 'l'}`}>{severity}</span>
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`tk-chev${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  )
}

/** 날짜·시각을 짧게: 11/2 10:58 (보는 사람의 시간대) */
export function stamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** YYYY-MM-DD → 11/2 */
export const mdOf = (d: string | null | undefined) => {
  const m = (d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${+m[2]}/${+m[3]}` : ''
}
