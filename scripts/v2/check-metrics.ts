/**
 * 지표 화면 값 점검 — 운영 DB 에서 읽어(SELECT 만) 지점별 6값과 막대 수를 한 줄씩 찍는다.
 *   npx tsx scripts/v2/check-metrics.ts
 */
import { readDbSnapshot, assembleUniverse } from '../../lib/v2/universeFromDb'
import { buildMetricsView } from '../../lib/v2/metrics'
import { supabaseFromEnvFile } from './supabase-env'

async function main() {
  const r = await readDbSnapshot(supabaseFromEnvFile())
  if (r.state !== 'ready') { console.log(r); return }
  const { universe } = assembleUniverse(r.db)
  const v = buildMetricsView(universe, r.db)
  console.log('as_of', v.as_of, 'last_week', v.last_week)
  for (const [k, s] of Object.entries(v.scopes)) {
    console.log(k, JSON.stringify({
      north: s.north.value, co: s.north.checkouts, est: s.north.est_neg, nsBars: s.north.series.map(b => `${b.label}:${b.value}`),
      solved: s.solved.value, obs: s.solved.observing,
      relapse: `${s.relapse.num}/${s.relapse.den}`, keep: `${s.keep.num}/${s.keep.den}`,
      ota: s.ota.value, below: s.ota.below, otaBars: s.ota.series.length, otaLast: s.ota.series.at(-1),
      voc: s.voc.ratio, vr: s.voc.reviews, vc: s.voc.checkouts, vocBars: s.voc.series.length,
      gal: s.galaxies.map(g => `${g.name}:${g.neg}/${g.pos}`).join(' '),
    }))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
