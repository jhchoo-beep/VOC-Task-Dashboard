export default function Loading() {
  return (
    <div style={{
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    }}>
      {/* 헤더 스켈레톤 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ width: 160, height: 28, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 220, height: 16, borderRadius: 6 }} />
      </div>

      {/* 카드 그리드 스켈레톤 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 60, height: 36, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 100, height: 12, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: '100%', height: 4, borderRadius: 2 }} />
          </div>
        ))}
      </div>

      {/* 하단 2컬럼 스켈레톤 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[1,2].map(i => (
          <div key={i} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ width: 140, height: 16, borderRadius: 6 }} />
            {[1,2,3].map(j => (
              <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton" style={{ width: 70, height: 12, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 50, height: 12, borderRadius: 4 }} />
                </div>
                <div className="skeleton" style={{ width: '100%', height: 5, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
