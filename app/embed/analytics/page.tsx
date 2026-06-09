export const revalidate = 60

import { getAnalyticsProps } from '@/lib/pageData'
import AnalyticsClient from '@/components/AnalyticsClient'

export default async function EmbedAnalyticsPage() {
  const props = await getAnalyticsProps()
  return <AnalyticsClient {...props} />
}
