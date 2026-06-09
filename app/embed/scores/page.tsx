export const revalidate = 300

import { getOtaScoresProps } from '@/lib/pageData'
import OtaScoresClient from '@/components/OtaScoresClient'

export default async function EmbedScoresPage() {
  const props = await getOtaScoresProps()
  return <OtaScoresClient {...props} />
}
