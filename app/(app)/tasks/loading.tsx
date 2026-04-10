export default function Loading() {
  return (
    <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ width: 120, height: 28, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 240, height: 16, borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ width: 80, height: 36, borderRadius: 8 }} />
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[100, 60, 80, 80, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 32, borderRadius: 8 }} />
        ))}
      </div>

      {/* 진행률 카드 */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 60, height: 50, borderRadius: 8 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 28, height: 24, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: 36, height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 수행과제 카드 목록 */}
      {[1,2,3,4,5].map(i => (
        <div key={i} className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '3px solid var(--border-2)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ width: 64, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 56, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 80, height: 20, borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ width: '70%', height: 20, borderRadius: 6 }} />
          <div style={{ display: 'flex', gap: 14 }}>
            <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 70, height: 14, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
