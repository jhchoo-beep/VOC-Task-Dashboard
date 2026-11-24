'use client'
// OTA 점수 2.0 — 수기 「데이터 입력」. 1.0 입력 모달과 같은 API·같은 값을 보낸다(디자인만 2.0).
// 임베드(읽기 전용)에서는 이 모달을 여는 버튼 자체를 그리지 않는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { bandsFor, type Granularity } from '@/lib/otaDetail'
import { VOC_BANDS_10 } from '@/lib/v2/ota'

export type InputMode = 'basic' | 'checkouts' | 'score-dist' | 'complaints' | 'voc'

export const INPUT_LABEL: Record<InputMode, string> = {
  'basic': '점수 · 리뷰 수',
  'checkouts': '주간 체크아웃 수',
  'score-dist': '점수 분포',
  'complaints': '불만 건수',
  'voc': 'VOC 키워드',
}

// 5점 척도(에어비앤비·NOL)는 1~5점을 그대로 쓴다 — 10점으로 환산하지 않는다
const vocBandsFor = (scoreMax: number) => (scoreMax === 5 ? [...bandsFor(5)].reverse() : VOC_BANDS_10)
const fmtSnap = (iso: string) => `${+iso.substring(5, 7)}월 ${+iso.substring(8, 10)}일`

export default function OtaInputModal({ branch, ota, propertyId, scoreMax, mode, checkoutDates, granularity, onClose, onSaved }: {
  branch: string; ota: string; propertyId: number | null; scoreMax: number; mode: InputMode
  // 이 채널에서 작성률 조인이 실제로 성립하는 스냅샷 기준일(채널 자신의 날짜, 가장 이른 날 제외 — pageData 주석)
  checkoutDates: string[]
  granularity: Granularity      // 월 단위 채널은 YYYY-MM-01 로 저장해야 주·월 행이 섞이지 않는다
  onClose: () => void; onSaved: () => void
}) {
  const today = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const vocBands = vocBandsFor(scoreMax)
  const usesGranularity = mode === 'score-dist' || mode === 'complaints' || mode === 'voc'
  const monthlyInput = usesGranularity && granularity === 'month'
  const snapshotDates = useMemo(() => [...checkoutDates].sort().reverse(), [checkoutDates])
  const useSnapshotPick = mode === 'checkouts' && snapshotDates.length > 0
  const noCheckoutDate = mode === 'checkouts' && snapshotDates.length === 0

  const [date, setDate] = useState(() => {
    if (mode === 'checkouts') return checkoutDates[checkoutDates.length - 1] ?? ''
    if (monthlyInput) return `${todayStr.substring(0, 7)}-01`
    return todayStr
  })
  const [score, setScore] = useState('')
  const [reviews, setReviews] = useState('')
  const [checkouts, setCheckouts] = useState('')
  const [distVals, setDistVals] = useState<string[]>(() => new Array(scoreMax === 5 ? 5 : 10).fill(''))
  const [roomComp, setRoom] = useState('0')
  const [bathComp, setBath] = useState('0')
  const [memo, setMemo] = useState('')
  const [headline, setHeadline] = useState('')
  const [vocItems, setVocItems] = useState<{ band: string; sentiment: 'good' | 'bad'; keyword: string }[]>([{ band: vocBands[0], sentiment: 'good', keyword: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  // 처음 열릴 때 한 번만 첫 칸에 초점을 둔다(부모가 다시 그려질 때마다 초점을 빼앗지 않게)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [])

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(await res.text())
  }

  const save = async () => {
    if (!propertyId) { setError('채널 번호(property_id)를 찾지 못했습니다.'); return }
    setSaving(true); setError('')
    try {
      if (mode === 'basic') {
        if (!date || !score || !reviews) throw new Error('날짜, 점수, 리뷰 수를 넣어 주세요.')
        await post('/api/ota/scores', { propertyId, recordedAt: date, overallScore: parseFloat(score), reviewCount: parseInt(reviews) })
      } else if (mode === 'checkouts') {
        if (!date || !checkouts) throw new Error('날짜와 체크아웃 수를 넣어 주세요.')
        await post('/api/ota/channel-checkouts', { propertyId, weekStart: date, checkoutCount: parseInt(checkouts) })
      } else if (mode === 'score-dist') {
        if (!date) throw new Error('날짜를 넣어 주세요.')
        const nums = distVals.map(v => parseInt(v) || 0)
        if (!nums.some(v => v > 0)) throw new Error('점수 분포 값을 1개 이상 넣어 주세요.')
        const counts: Record<string, number> = {}
        nums.forEach((v, i) => { counts[`score_${i + 1}`] = v })
        await post('/api/ota/score-dist', { propertyId, weekStart: date, granularity, scoreMax, counts })
      } else if (mode === 'complaints') {
        if (!date) throw new Error('날짜를 넣어 주세요.')
        await post('/api/ota/complaints', { propertyId, weekStart: date, granularity, roomComplaints: parseInt(roomComp) || 0, bathroomComplaints: parseInt(bathComp) || 0, memo, headline })
      } else {
        if (!date) throw new Error('날짜를 넣어 주세요.')
        const items = vocItems.filter(v => v.keyword.trim())
        if (!items.length) throw new Error('키워드를 1개 이상 넣어 주세요.')
        await post('/api/ota/voc', { propertyId, weekStart: date, granularity, items })
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message || '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const setVoc = (i: number, field: 'band' | 'sentiment' | 'keyword', value: string) =>
    setVocItems(prev => prev.map((it, k) => (k === i ? { ...it, [field]: value } : it)))

  return (
    <div className="ota-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} className="ota-modal" role="dialog" aria-modal="true" aria-labelledby="ota-modal-t">
        <div className="detail-meta"><span>{branch} · {ota} · <span className="num">/{scoreMax}</span>점</span></div>
        <h2 id="ota-modal-t" className="ota-modal-t">{INPUT_LABEL[mode]} 입력</h2>

        {useSnapshotPick ? (
          <label className="ota-f">
            <span>대상 주 · 점수 스냅샷 기준일</span>
            <select className="ota-in" value={date} onChange={e => setDate(e.target.value)}>
              {snapshotDates.map(d => <option key={d} value={d}>{fmtSnap(d)}</option>)}
            </select>
          </label>
        ) : noCheckoutDate ? (
          <div className="ota-empty" style={{ margin: '0 0 14px' }}><b>입력할 수 있는 주 없음 · 이 채널 점수 스냅샷이 2회 미만</b></div>
        ) : monthlyInput ? (
          <label className="ota-f">
            <span>기준 월 · 그 달 1일로 저장</span>
            <input className="ota-in" type="month" value={date.substring(0, 7)} onChange={e => setDate(e.target.value ? `${e.target.value}-01` : '')} />
          </label>
        ) : (
          <label className="ota-f">
            <span>기준 날짜</span>
            <input className="ota-in" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>
        )}

        {mode === 'basic' && (
          <div className="ota-grid2">
            <label className="ota-f"><span>점수 · <span className="num">/{scoreMax}</span></span><input className="ota-in num" type="number" step="0.01" min="0" max={scoreMax} value={score} onChange={e => setScore(e.target.value)} /></label>
            <label className="ota-f"><span>누적 리뷰 수</span><input className="ota-in num" type="number" min="0" value={reviews} onChange={e => setReviews(e.target.value)} /></label>
          </div>
        )}

        {mode === 'checkouts' && !noCheckoutDate && (
          <label className="ota-f">
            <span>{ota} 예약 체크아웃 수 · 이 채널만</span>
            <input className="ota-in num" type="number" min="0" value={checkouts} onChange={e => setCheckouts(e.target.value)} />
          </label>
        )}

        {mode === 'score-dist' && (
          <div className="ota-grid3">
            {bandsFor(scoreMax).map((label, i) => (
              <label key={label} className="ota-f">
                <span>{label}</span>
                <input className="ota-in num" type="number" min="0" placeholder="0" value={distVals[i] ?? ''}
                  onChange={e => setDistVals(prev => prev.map((v, k) => (k === i ? e.target.value : v)))} />
              </label>
            ))}
          </div>
        )}

        {mode === 'complaints' && (
          <>
            <div className="ota-grid2">
              <label className="ota-f"><span>객실 정비 불만</span><input className="ota-in num" type="number" min="0" value={roomComp} onChange={e => setRoom(e.target.value)} /></label>
              <label className="ota-f"><span>욕실 불만</span><input className="ota-in num" type="number" min="0" value={bathComp} onChange={e => setBath(e.target.value)} /></label>
            </div>
            <label className="ota-f"><span>한 줄 요약</span><input className="ota-in" type="text" maxLength={60} value={headline} onChange={e => setHeadline(e.target.value)} /></label>
            <label className="ota-f"><span>운영 메모</span><input className="ota-in" type="text" value={memo} onChange={e => setMemo(e.target.value)} /></label>
          </>
        )}

        {mode === 'voc' && (
          <div className="ota-voc-in">
            {vocItems.map((it, i) => (
              <div key={i} className="ota-voc-row">
                <select className="ota-in" aria-label="점수 밴드" value={it.band} onChange={e => setVoc(i, 'band', e.target.value)}>
                  {vocBands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select className="ota-in" aria-label="감정" value={it.sentiment} onChange={e => setVoc(i, 'sentiment', e.target.value)}>
                  <option value="good">좋아요</option>
                  <option value="bad">나빠요</option>
                </select>
                <input className="ota-in" type="text" aria-label="키워드" value={it.keyword} onChange={e => setVoc(i, 'keyword', e.target.value)} />
                <button type="button" className="act" aria-label={`${i + 1}번째 키워드 빼기`} onClick={() => setVocItems(prev => prev.filter((_, k) => k !== i))}>빼기</button>
              </div>
            ))}
            <button type="button" className="act" onClick={() => setVocItems(prev => [...prev, { band: vocBands[0], sentiment: 'good', keyword: '' }])}>키워드 추가</button>
          </div>
        )}

        {error && <div className="ota-err" role="alert">{error}</div>}

        <div className="ota-modal-f">
          <button type="button" className="act" onClick={onClose}>취소</button>
          <button type="button" className="act pri" onClick={save} disabled={saving || noCheckoutDate}>{saving ? '저장 중' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
