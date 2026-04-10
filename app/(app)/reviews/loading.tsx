export default function Loading() {
  return (
    <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ width: 120, height: 28, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 240, height: 16, borderRadius: 6 }} />
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[100, 60, 80, 80, 80, 80, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 32, borderRadius: 8 }} />
        ))}
      </div>

      {/* 통계 카드 4개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="card" style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 40, height: 28, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* 헤더 행 */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 70px 80px 1fr 80px', padding: '9px 16px', borderBottom: '1px solid var(--border)', gap: 8 }}>
          {[60, 50, 40, 60, 200, 60].map((w, i) => (
            <div key={i} className="skeleton" style={{ width: w, height: 12, borderRadius: 4 }} />
          ))}
        </div>
        {/* 데이터 행 */}
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 80px 70px 80px 1fr 80px', padding: '11px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 8 }}>
            <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 50, height: 14, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 36, height: 14, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 56, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 50, height: 20, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
