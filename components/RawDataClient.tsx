'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Star, ChevronDown, ChevronUp, Loader2, FileText, Upload } from 'lucide-react'
import { formatMonth, generateMonthOptions } from '@/lib/utils'

const BRANCH_BADGE: Record<string, string> = { '제주시티':'badge-jeju','제주':'badge-jeju','동대문':'badge-ddm','신설':'badge-sinseol','고성':'badge-goseong' }
const BRANCHES = ['전체','제주시티','동대문','신설','고성']

function Field({ label, children }: any) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

export default function RawDataClient({ rawReviews, months, currentMonth }: any) {
  const router = useRouter()
  const [branch, setBranch] = useState('전체')
  const [ota, setOta]       = useState('전체')
  const [expanded, setExpanded] = useState<string|null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc')

  const otaSites = ['전체', ...Array.from(new Set(rawReviews.map((r: any) => r.ota_site).filter(Boolean))) as string[]]

  const handleDelete = async (id: string) => {
    if (!confirm('이 Raw 리뷰를 삭제할까요?')) return
    await fetch('/api/rawdata/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    router.refresh()
  }

  const filtered = rawReviews
    .filter((r: any) => {
      if (branch !== '전체' && r.branch !== branch) return false
      if (ota !== '전체' && r.ota_site !== ota) return false
      return true
    })
    .sort((a: any, b: any) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return sortDir === 'desc' ? tb - ta : ta - tb
    })

  const avgRating = filtered.length && filtered.some((r: any) => r.rating != null)
    ? (filtered.filter((r: any) => r.rating != null).reduce((s: number, r: any) => s + r.rating, 0) / filtered.filter((r: any) => r.rating != null).length).toFixed(2)
    : '-'

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Raw Data</h1>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>원본 수집 리뷰 데이터 · 미처리 상태 그대로 보관</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 데이터 추가
        </button>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={currentMonth} onChange={e => router.push(`/rawdata?month=${e.target.value}`)} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
          {months.length === 0
            ? <option value="">데이터 없음</option>
            : months.map((m: string) => <option key={m} value={m}>{formatMonth(m)}</option>)
          }
        </select>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        {BRANCHES.map(b => (
          <button key={b} className={`btn ${branch === b ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setBranch(b)}>{b}</button>
        ))}
      </div>

      {/* OTA 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>OTA</span>
        {otaSites.map(o => (
          <button key={o} className={`btn ${ota === o ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setOta(o)}>{o}</button>
        ))}
      </div>

      {/* 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '총 리뷰', value: filtered.length, color: 'var(--text-1)' },
          { label: '평균 평점', value: avgRating, color: 'var(--accent)' },
          { label: '답변 완료', value: filtered.filter((r: any) => r.has_response).length, color: 'var(--done)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '13px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      {filtered.length === 0
        ? <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ color: 'var(--text-2)' }}>Raw 리뷰 데이터가 없습니다.<br/>오른쪽 상단 버튼으로 텍스트/CSV/엑셀을 추가해주세요.</div>
          </div>
        : <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 75px 60px 70px 80px 1fr 80px 44px', padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {['지점','OTA','평점','날짜','리뷰어','내용'].map(h => <span key={h}>{h}</span>)}
              <span
                onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                style={{ cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, userSelect: 'none' }}
              >
                수집일{sortDir === 'desc' ? ' ↓' : ' ↑'}
              </span>
              <span />
            </div>
            {filtered.map((r: any) => {
              const isOpen = expanded === r.id
              return (
                <div key={r.id}>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '90px 75px 60px 70px 80px 1fr 80px 44px', padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', transition: 'background 0.15s', background: isOpen ? 'var(--bg-hover)' : 'transparent' }}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <span className={`badge ${BRANCH_BADGE[r.branch] ?? 'badge-low'}`} style={{ fontSize: 11, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.branch}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ota_site}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, color: r.rating == null ? 'var(--text-3)' : r.rating < 5 ? 'var(--critical)' : r.rating < 7 ? 'var(--medium)' : 'var(--done)' }}>
                      {r.rating != null ? <><Star size={10} fill="currentColor" />{r.rating}</> : '-'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.raw_date ?? '-'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reviewer ?? '-'}{r.country ? ` (${r.country})` : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {(r.content ?? '').slice(0, 60)}{(r.content?.length ?? 0) > 60 ? '...' : ''}
                      </span>
                      {isOpen ? <ChevronUp size={11} color="var(--text-3)" style={{ flexShrink: 0 }} /> : <ChevronDown size={11} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(r.id)} title="삭제"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--critical)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--critical)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                      {r.content && (
                        <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', marginBottom: 10 }}>
                          {r.content}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
                        {r.travel_type && <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>🧳 {r.travel_type}</span>}
                        {r.room_type   && <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>🛏 {r.room_type}</span>}
                        {r.has_response && <span className="badge" style={{ background: 'rgba(0,229,102,0.1)', color: 'var(--done)' }}>✅ 답변완료</span>}
                        {r.created_at && <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>📅 수집일 {new Date(r.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      }

      {showAdd && <AddRawModal currentMonth={currentMonth} months={months} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); router.refresh() }} />}
    </div>
  )
}

/* ─── Raw 데이터 추가 모달 (텍스트 붙여넣기 + CSV/엑셀) ─── */
function AddRawModal({ currentMonth, months, onClose, onSuccess }: any) {
  const generatedMonths = generateMonthOptions()
  const allMonths = [...new Set([...(months ?? []), ...generatedMonths])].sort().reverse()

  const [tab, setTab] = useState<'text'|'file'>('text')
  const [branch, setBranch] = useState('동대문')
  const [otaSite, setOtaSite] = useState('')
  const [reviewMonth, setReviewMonth] = useState(currentMonth || generatedMonths[0])
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [fileRows, setFileRows] = useState<any[]>([])
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // CSV 파싱
  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
    return lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) ?? []
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
      return obj
    }).filter(r => Object.values(r).some(v => v))
  }

  // 파일 업로드 처리
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')

    if (file.name.endsWith('.csv')) {
      const text = await file.text()
      const rows = parseCSV(text)
      setFileRows(rows)
      setProgress(`${rows.length}행 파싱됨. 확인 후 저장하세요.`)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      setFileError('엑셀 파일은 CSV로 저장 후 업로드해주세요. (엑셀 → 다른 이름으로 저장 → CSV UTF-8)')
    } else {
      setFileError('CSV 파일만 지원합니다.')
    }
  }

  // 텍스트 통째 저장 (raw_text 컬럼에 그대로 저장)
  const saveText = async () => {
    if (!rawText.trim() || !otaSite.trim()) return
    setSaving(true)
    setProgress('저장 중...')
    await fetch('/api/rawdata', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch, ota_site: otaSite, review_month: reviewMonth,
        content: rawText.trim(),
        raw_date: new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
      }),
    })
    setSaving(false)
    setProgress('저장 완료!')
    setTimeout(onSuccess, 500)
  }

  // CSV 행 일괄 저장
  const saveFileRows = async () => {
    if (!fileRows.length || !otaSite.trim()) return
    setSaving(true)
    let done = 0
    for (const row of fileRows) {
      const content = row['content'] || row['리뷰 내용'] || row['review'] || row['review_text'] || Object.values(row).join(' ')
      const rating = parseFloat(row['rating'] || row['점수'] || row['score'] || '') || null
      const reviewer = row['reviewer'] || row['리뷰어'] || row['name'] || null
      const country = row['country'] || row['국가'] || null
      const rawDate = row['date'] || row['날짜'] || row['raw_date'] || null
      const travelType = row['travel_type'] || row['여행유형'] || null
      const roomType = row['room_type'] || row['객실'] || null
      await fetch('/api/rawdata', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, ota_site: otaSite, review_month: reviewMonth, content, rating, reviewer, country, raw_date: rawDate, travel_type: travelType, room_type: roomType }),
      })
      done++
      setProgress(`${done}/${fileRows.length}건 저장 중...`)
    }
    setSaving(false)
    setProgress(`완료! ${done}건 저장됨`)
    setTimeout(onSuccess, 800)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="font-display" style={{ fontSize: 16, fontWeight: 700 }}>Raw 데이터 추가</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* 공통 필드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <Field label="지점 *">
              <select className="input" value={branch} onChange={e => setBranch(e.target.value)}>
                {['제주시티','동대문','신설','고성'].map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="OTA 사이트 *">
              <input className="input" placeholder="아고다, 에어비앤비 등" value={otaSite} onChange={e => setOtaSite(e.target.value)} />
            </Field>
            <Field label="리뷰 월 *">
              <select className="input" value={reviewMonth} onChange={e => setReviewMonth(e.target.value)}>
                {allMonths.map((m: string) => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </select>
            </Field>
          </div>

          {/* 탭 선택 */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setTab('text')}
              style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: tab === 'text' ? 600 : 400, cursor: 'pointer', border: 'none', borderRight: '1px solid var(--border)', background: tab === 'text' ? 'var(--accent)' : 'var(--bg-input)', color: tab === 'text' ? '#fff' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FileText size={13} /> 텍스트 붙여넣기
            </button>
            <button
              onClick={() => setTab('file')}
              style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: tab === 'file' ? 600 : 400, cursor: 'pointer', border: 'none', background: tab === 'file' ? 'var(--accent)' : 'var(--bg-input)', color: tab === 'file' ? '#fff' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={13} /> CSV / 파일 업로드
            </button>
          </div>

          {/* 텍스트 탭 */}
          {tab === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                💡 <strong style={{ color: 'var(--text-2)' }}>텍스트 통째로 붙여넣기</strong> — OTA에서 복사한 리뷰 내용을 그대로 붙여넣으세요.<br/>
                여러 리뷰를 한꺼번에 넣어도 됩니다. 원본 그대로 보관됩니다.
              </div>
              <textarea
                className="input"
                rows={12}
                placeholder={"OTA 페이지에서 복사한 리뷰를 그대로 붙여넣으세요.\n\n예시)\n3/31  10점  Fala (CN)\n一切都很好，就是有点贵\n\n3/30  8점  TOMOMI (JP)\nとってもいい匂いが漂っている。ランドリー無料..."}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              />
            </div>
          )}

          {/* 파일 탭 */}
          {tab === 'file' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                💡 <strong style={{ color: 'var(--text-2)' }}>CSV 파일 업로드</strong> — 엑셀/구글시트에서 CSV로 저장 후 업로드하세요.<br/>
                헤더 예시: <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>date, rating, reviewer, country, content, travel_type, room_type</code><br/>
                한글 헤더도 지원: <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>날짜, 점수, 리뷰어, 국가, 리뷰 내용</code>
              </div>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onClick={() => fileRef.current?.click()}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
              >
                <Upload size={28} style={{ color: 'var(--text-3)', marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>CSV 파일을 클릭하여 선택</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>엑셀 파일은 먼저 CSV로 저장하세요</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
              </div>
              {fileError && <div style={{ color: 'var(--critical)', fontSize: 12, padding: '8px 12px', background: 'rgba(255,59,92,0.08)', borderRadius: 8 }}>{fileError}</div>}
              {fileRows.length > 0 && (
                <div style={{ background: 'rgba(0,229,102,0.08)', border: '1px solid rgba(0,229,102,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ color: 'var(--done)', fontWeight: 600, marginBottom: 4 }}>✅ {fileRows.length}행 파싱 완료</div>
                  <div style={{ color: 'var(--text-3)' }}>미리보기 (최대 3행):</div>
                  {fileRows.slice(0, 3).map((row, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Object.values(row).join(' | ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {progress && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', padding: '6px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}>
              {progress}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          {tab === 'text' ? (
            <button className="btn btn-primary" onClick={saveText} disabled={saving || !rawText.trim() || !otaSite.trim()}>
              {saving ? <><Loader2 size={13} className="spin" /> 저장 중...</> : '저장'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={saveFileRows} disabled={saving || !fileRows.length || !otaSite.trim()}>
              {saving ? <><Loader2 size={13} className="spin" /> {progress}</> : `${fileRows.length}건 저장`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
