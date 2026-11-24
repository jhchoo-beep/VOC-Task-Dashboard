// 아직 2.0으로 다시 만들지 않은 탭. 1.0 화면으로 바로 가는 길만 둔다.
import Link from 'next/link'

export default function Soon({ title, v1 }: { title: string; v1: { href: string; label: string }[] }) {
  return (
    <main className="v2-home">
      <div className="v2-home-head"><div><div className="v2-eyebrow">2.0 디자인 작업 중</div><h1 className="v2-h1">{title}</h1></div></div>
      <div className="card" style={{ maxWidth: 560 }}>
        <span className="card-k">지금은 1.0 화면에서 봅니다</span>
        <span style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {v1.map(l => <Link key={l.href} href={l.href} className="act">{l.label}</Link>)}
        </span>
      </div>
    </main>
  )
}
