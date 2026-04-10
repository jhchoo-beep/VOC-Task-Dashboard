export default function Loading() {
  return (
    <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ width: 150, height: 28, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 210, height: 16, borderRadius: 6 }} />
      </div>

      {/* 라인 차트 카드 */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ width: 180, height: 16, borderRadius: 6 }} />
        {/* 차트 영역 */}
        <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end', gap: 2, paddingBottom: 30 }}>
          {/* Y축 */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', paddingBottom: 30 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="skeleton" style={{ width: 24, height: 10, borderRadius: 3 }} />
            ))}
          </div>
          {/* 차트 라인 시뮬레이션 */}
          <div style={{ flex: 1, height: '85%', position: 'relative' }}>
            <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 8, opacity: 0.4 }} />
          </div>
        </div>
        {/* 범례 */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%' }} />
              <div className="skeleton" style={{ width: 50, height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 바 차트 카드 */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ width: 200, height: 16, borderRadius: 6 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, padding: '0 8px' }}>
          {[65, 80, 45, 90, 55, 70, 40, 75].map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: '100%', height: `${h}%`, borderRadius: '4px 4px 0 0' }} />
              <div className="skeleton" style={{ width: '80%', height: 10, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
