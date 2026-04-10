// 'YYYY-MM' → '2026년 4월'
export function formatMonth(m: string): string {
  if (!m) return ''
  const [year, month] = m.split('-')
  if (!year || !month) return m
  return `${year}년 ${parseInt(month)}월`
}

// '2026년 4월' → 'YYYY-MM' (역변환 - 드롭다운 value용)
export function parseMonth(label: string): string {
  const match = label.match(/(\d{4})년\s*(\d{1,2})월/)
  if (!match) return label
  return `${match[1]}-${match[2].padStart(2, '0')}`
}

// 현재 월 기준 선택 가능한 월 목록 생성 (최근 12개월)
export function generateMonthOptions(): string[] {
  const options: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    options.push(`${y}-${m}`)
  }
  return options
}
