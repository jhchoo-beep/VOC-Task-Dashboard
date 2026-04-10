export default function Loading() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <div className="skeleton" style={{ width: 180, height: 28, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 260, height: 16, marginBottom: 28 }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ width: 80, height: 32, borderRadius: 8 }} />)}
      </div>
      <div className="skeleton" style={{ width: '100%', height: 400, borderRadius: 12 }} />
    </div>
  )
}
