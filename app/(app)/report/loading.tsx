export default function Loading() {
  return (
    <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ width: 140, height: 28, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 220, height: 16, borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ width: 110, height: 36, borderRadius: 8 }} />
      </div>

      {/* 종합 성과 테이블 */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: 180, height: 16, borderRadius: 6 }} />
        </div>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 100px 80px 80px 80px 80px 60px 60px 60px 60px', padding: '14px', borderBottom: '1px solid var(--border)', gap: 8, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 70, height: 16, borderRadius: 6 }} />
            {[50, 50, 60, 60, 40, 40, 40, 40].map((w, j) => (
              <div key={j} className="skeleton" style={{ width: w, height: 14, borderRadius: 4 }} />
            ))}
          </div>
        ))}
      </div>

      {/* 하단 2컬럼 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[1,2].map(col => (
          <div key={col} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="skeleton" style={{ width: 180, height: 16, borderRadius: 6 }} />
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton" style={{ width: `${40 + i * 10}%`, height: 14, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 40, height: 14, borderRadius: 4 }} />
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
