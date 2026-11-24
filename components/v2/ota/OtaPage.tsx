// STAY VOC 2.0 OTA 점수 — 서버에서 1.0 과 같은 데이터(getOtaScoresProps)를 읽어 콘솔에 넘긴다.
// 로그인 화면(app/v2/ota)과 읽기 전용 임베드(app/embed/v2/ota)가 같이 쓴다.
// 🔴 캐시하지 않는다(호출하는 page 에서 force-dynamic). 수집 스크래퍼가 DB 에 직접 쓰기 때문 — lib/pageData.ts 상단 주석.
import { getOtaScoresProps } from '@/lib/pageData'
import { getOtaUrls } from '@/lib/v2/otaData'
import { ALL, INTEGRATED, branchesOf, channelsOf, type OtaProps } from '@/lib/v2/ota'
import OtaConsole from './OtaConsole'

type SP = { [k: string]: string | string[] | undefined }

export default async function OtaPage({ sp, readOnly }: { sp: SP; readOnly: boolean }) {
  let props: OtaProps | null = null
  let error: string | null = null
  try {
    props = (await getOtaScoresProps()) as OtaProps
  } catch (e) {
    console.error('OTA 점수 조회 실패', (e as Error).message)
    error = 'OTA 점수를 읽지 못했습니다.'
  }
  if (!props) return <main className="v2-console"><div className="empty">{error}</div></main>

  const urls = await getOtaUrls()
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const branches = branchesOf(props)
  const b = str('branch')
  const scope = b && branches.includes(b) ? b : ALL
  const ch = str('ch')
  const initialCh = scope !== ALL && ch && (ch === INTEGRATED || channelsOf(props, scope).includes(ch)) ? ch : null

  return <OtaConsole data={props} urls={urls} initialScope={scope} initialCh={initialCh} readOnly={readOnly} />
}
