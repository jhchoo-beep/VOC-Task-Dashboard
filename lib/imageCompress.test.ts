import { describe, it, expect } from 'vitest'
import { fitDimensions, MAX_EDGE } from './imageCompress'

describe('fitDimensions', () => {
  it('긴 변이 maxEdge보다 크면 종횡비 유지하며 축소한다 (가로)', () => {
    expect(fitDimensions(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
  })
  it('긴 변이 maxEdge보다 크면 종횡비 유지하며 축소한다 (세로)', () => {
    expect(fitDimensions(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })
  it('원본이 이미 작으면 확대하지 않고 그대로 둔다', () => {
    expect(fitDimensions(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
  it('긴 변이 정확히 maxEdge면 그대로 둔다', () => {
    expect(fitDimensions(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 })
  })
  it('축소 결과는 정수로 반올림한다', () => {
    // 4032x3024(4:3 폰 사진) → 2048 기준
    expect(fitDimensions(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 })
  })
  it('정사각형도 축소한다', () => {
    expect(fitDimensions(3000, 3000, 2000)).toEqual({ width: 2000, height: 2000 })
  })
  it('기본 MAX_EDGE는 2048이다', () => {
    expect(MAX_EDGE).toBe(2048)
  })
})
