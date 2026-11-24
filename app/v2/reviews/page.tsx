import Soon from '@/components/v2/Soon'

export default function Page() {
  return <Soon title="리뷰 원문" v1={[{ href: '/reviews', label: '1.0 리뷰 데이터' }, { href: '/rawdata', label: '1.0 Raw Data' }]} />
}
