// STAY VOC 2.0 OTA 점수 — 서버 쪽 조회. 점수·분포·불만·VOC·작성률은 1.0 의 getOtaScoresProps 를 그대로 쓰고,
// 여기서는 그 함수가 내려주지 않는 채널 원문 페이지 주소(ota_properties.ota_url)만 읽는다.
import { supabase } from '../supabase'

/** property_id → OTA 사이트 주소. ota_properties 는 지점 × 채널 마스터(수십 행)라 1000행 상한에 닿지 않는다 */
export async function getOtaUrls(): Promise<Record<number, string>> {
  const { data, error } = await supabase.from('ota_properties').select('property_id,ota_url').eq('active', true).order('property_id')
  if (error) { console.error('OTA 주소 조회 실패', error.message); return {} }
  const out: Record<number, string> = {}
  for (const r of data ?? []) {
    const u = (r.ota_url as string | null)?.trim()
    if (u && /^https?:\/\//i.test(u)) out[r.property_id as number] = u
  }
  return out
}
