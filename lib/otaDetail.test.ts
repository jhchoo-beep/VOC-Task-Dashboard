import { describe, it, expect } from 'vitest'
import { parseRawDate, weekStartOf, monthStartOf } from './otaDetail'

describe('parseRawDate', () => {
  it('ISO 형식(아고다·익스피디아)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026-07-21')).toEqual({ date: '2026-07-21', month: '2026-07' })
  })

  it('한글 전체 날짜(부킹·트립닷컴)를 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026년 7월 22일')).toEqual({ date: '2026-07-22', month: '2026-07' })
    expect(parseRawDate('2023년 7월 29일')).toEqual({ date: '2023-07-29', month: '2023-07' })
  })

  it('점 구분 형식(야놀자)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026.07.04')).toEqual({ date: '2026-07-04', month: '2026-07' })
    expect(parseRawDate('2026.06.08')).toEqual({ date: '2026-06-08', month: '2026-06' })
  })

  it('한글 연월(에어비앤비)은 일이 없으므로 date가 null이다', () => {
    expect(parseRawDate('2026년 6월')).toEqual({ date: null, month: '2026-06' })
  })

  it('영문 연월(아고다)은 일이 없으므로 date가 null이다', () => {
    expect(parseRawDate('March 2026')).toEqual({ date: null, month: '2026-03' })
    expect(parseRawDate('June 2026')).toEqual({ date: null, month: '2026-06' })
  })

  it('영문 연월은 대소문자를 가리지 않는다', () => {
    expect(parseRawDate('march 2026')).toEqual({ date: null, month: '2026-03' })
    expect(parseRawDate('DECEMBER 2025')).toEqual({ date: null, month: '2025-12' })
  })

  it('영문 연월은 앞뒤 공백을 허용한다', () => {
    expect(parseRawDate('  April 2026  ')).toEqual({ date: null, month: '2026-04' })
  })

  it('월 이름이 아닌 영문 문자열은 review_month 폴백으로 넘어간다', () => {
    // 'Marchtember'는 월 이름이 아니므로 영문 규칙에 걸려서는 안 된다
    expect(parseRawDate('Marchtember 2026', '2026-05')).toEqual({ date: null, month: '2026-05' })
    expect(parseRawDate('Someday 2026')).toEqual({ date: null, month: null })
  })

  it('상대 표현(여기어때)은 review_month로 대체한다', () => {
    expect(parseRawDate('2개월 전', '2026-04')).toEqual({ date: null, month: '2026-04' })
  })

  it('해석 불가 + review_month도 없으면 둘 다 null이다', () => {
    expect(parseRawDate('알 수 없음')).toEqual({ date: null, month: null })
    expect(parseRawDate(null)).toEqual({ date: null, month: null })
    expect(parseRawDate('')).toEqual({ date: null, month: null })
  })

  it('한 자리 월·일을 0으로 채운다', () => {
    expect(parseRawDate('2026년 3월 5일')).toEqual({ date: '2026-03-05', month: '2026-03' })
  })
})

describe('weekStartOf', () => {
  it('월요일 시작 주로 내린다', () => {
    expect(weekStartOf('2026-07-22')).toBe('2026-07-20') // 수 → 월
    expect(weekStartOf('2026-07-20')).toBe('2026-07-20') // 월 → 그대로
    expect(weekStartOf('2026-07-26')).toBe('2026-07-20') // 일 → 그 주 월
  })

  it('월 경계를 넘어가도 맞는 월요일을 찾는다', () => {
    expect(weekStartOf('2026-07-01')).toBe('2026-06-29')
  })
})

describe('monthStartOf', () => {
  it('월 첫날로 정규화한다', () => {
    expect(monthStartOf('2026-06')).toBe('2026-06-01')
  })
})

import { addDaysIso, recentWeekStarts, monthsCovering } from './otaDetail'

describe('addDaysIso', () => {
  it('일수를 더하고 뺀다', () => {
    expect(addDaysIso('2026-07-20', 6)).toBe('2026-07-26')
    expect(addDaysIso('2026-07-20', -7)).toBe('2026-07-13')
  })

  it('월·연 경계를 넘는다', () => {
    expect(addDaysIso('2026-07-27', 6)).toBe('2026-08-02')
    expect(addDaysIso('2026-02-27', 2)).toBe('2026-03-01') // 2026은 평년
    expect(addDaysIso('2025-12-29', 6)).toBe('2026-01-04')
  })
})

describe('recentWeekStarts', () => {
  it('기준일이 속한 주부터 n개 주의 월요일을 오름차순으로 준다', () => {
    expect(recentWeekStarts('2026-07-22', 4)).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20',
    ])
  })

  it('기준일이 월요일이면 그 주가 포함된다', () => {
    // 기준일을 인자로 받는 이유 — 로컬/UTC 혼용으로 이번 주가 빠지는 것을 막는다
    expect(recentWeekStarts('2026-07-20', 2)).toEqual(['2026-07-13', '2026-07-20'])
  })
})

describe('monthsCovering', () => {
  it('주 시작일의 달만이 아니라 주 구간(월~일)이 걸치는 달을 모두 준다', () => {
    // 8/1 실행 시 마지막 주는 7/27~8/2 — 8월이 빠지면 그 주가 통째로 잘린다
    const weeks = recentWeekStarts('2026-08-01', 4)
    expect(weeks[weeks.length - 1]).toBe('2026-07-27')
    expect(monthsCovering(weeks)).toEqual(['2026-07', '2026-08'])
  })

  it('9월·11월 첫날 실행에서도 이번 달이 들어간다', () => {
    expect(monthsCovering(recentWeekStarts('2026-09-01', 4))).toContain('2026-09')
    expect(monthsCovering(recentWeekStarts('2026-11-01', 4))).toContain('2026-11')
  })

  it('연 경계를 넘어도 사이의 달을 빠뜨리지 않는다', () => {
    expect(monthsCovering(['2025-12-29'])).toEqual(['2025-12', '2026-01'])
    expect(monthsCovering(['2026-01-05', '2026-03-30'])).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
  })

  it('빈 입력은 빈 배열이다', () => {
    expect(monthsCovering([])).toEqual([])
  })
})

import { bucketPeriodEnd, isUnsettledBucket, SETTLE_GRACE_DAYS } from './otaDetail'

describe('bucketPeriodEnd', () => {
  it('주 버킷은 시작일(월)+6일인 일요일이다', () => {
    expect(bucketPeriodEnd('2026-07-20', 'week')).toBe('2026-07-26')
    expect(bucketPeriodEnd('2026-07-27', 'week')).toBe('2026-08-02') // 월 경계
  })

  it('월 버킷은 그 달의 말일이다', () => {
    expect(bucketPeriodEnd('2026-07-01', 'month')).toBe('2026-07-31')
    expect(bucketPeriodEnd('2026-06-01', 'month')).toBe('2026-06-30')
    expect(bucketPeriodEnd('2026-02-01', 'month')).toBe('2026-02-28') // 2026은 평년
    expect(bucketPeriodEnd('2024-02-01', 'month')).toBe('2024-02-29') // 윤년
    expect(bucketPeriodEnd('2026-12-01', 'month')).toBe('2026-12-31') // 연 경계
  })
})

describe('isUnsettledBucket', () => {
  it('유예 일수는 7일이다', () => {
    expect(SETTLE_GRACE_DAYS).toBe(7)
  })

  it('아직 끝나지 않은 주는 미확정이다', () => {
    // 7/22(수)에 보는 7/20 주는 7/26에나 끝난다 — 이번 주가 굳어 버리는 것이 이 규칙의 발단
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-07-22')).toBe(true)
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-07-20')).toBe(true)
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-07-26')).toBe(true)
  })

  it('끝난 지 7일 이내인 주는 여전히 미확정이다', () => {
    // 구간 종료 7/26 + 유예 7일 = 8/2까지 미확정
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-07-27')).toBe(true)
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-08-02')).toBe(true)
  })

  it('끝난 지 7일을 넘긴 주는 확정이다', () => {
    expect(isUnsettledBucket('2026-07-20', 'week', '2026-08-03')).toBe(false)
    expect(isUnsettledBucket('2026-06-29', 'week', '2026-07-22')).toBe(false)
  })

  it('아직 끝나지 않은 달은 미확정이다', () => {
    expect(isUnsettledBucket('2026-07-01', 'month', '2026-07-01')).toBe(true)
    expect(isUnsettledBucket('2026-07-01', 'month', '2026-07-22')).toBe(true)
    expect(isUnsettledBucket('2026-07-01', 'month', '2026-07-31')).toBe(true)
  })

  it('끝난 지 7일 이내인 달은 여전히 미확정이다', () => {
    // 6월 말일 6/30 + 유예 7일 = 7/7까지 — 지난달 뒤늦은 리뷰가 들어오는 구간이다
    expect(isUnsettledBucket('2026-06-01', 'month', '2026-07-01')).toBe(true)
    expect(isUnsettledBucket('2026-06-01', 'month', '2026-07-07')).toBe(true)
  })

  it('끝난 지 7일을 넘긴 달은 확정이다', () => {
    expect(isUnsettledBucket('2026-06-01', 'month', '2026-07-08')).toBe(false)
    expect(isUnsettledBucket('2026-06-01', 'month', '2026-07-22')).toBe(false)
    expect(isUnsettledBucket('2025-12-01', 'month', '2026-01-09')).toBe(false) // 연 경계
  })

  it('미래 구간은 미확정이다', () => {
    // 아직 오지 않은 구간을 확정으로 봐서 건너뛰면 영영 분석되지 않는다
    expect(isUnsettledBucket('2026-08-01', 'month', '2026-07-22')).toBe(true)
    expect(isUnsettledBucket('2026-08-03', 'week', '2026-07-22')).toBe(true)
  })
})

import {
  mergeSource, planDetailWrite, isWriteAction, WRITE_ACTION_LABEL,
  type DetailSource, type WriteAction,
} from './otaDetail'

describe('mergeSource', () => {
  it('한 키의 첫 행은 그 행의 출처를 그대로 쓴다', () => {
    expect(mergeSource(undefined, 'manual')).toBe('manual')
    expect(mergeSource(undefined, 'derived')).toBe('derived')
  })

  it('파생 행만 모인 키는 derived다', () => {
    expect(mergeSource('derived', 'derived')).toBe('derived')
  })

  it('한 행이라도 수기면 그 키 전체를 manual로 본다', () => {
    // ota_voc는 키 하나에 키워드 행이 여럿이다. 마지막 행이 이기게 두면
    // 정렬 순서에 따라 수기 행이 섞인 키가 derived로 보여 통째로 지워진다.
    expect(mergeSource('derived', 'manual')).toBe('manual')
    expect(mergeSource('manual', 'derived')).toBe('manual')
    expect(mergeSource('manual', 'manual')).toBe('manual')
  })
})

describe('planDetailWrite', () => {
  const fill     = { fillEmpty: true,  unsettled: true  }
  const fillDone = { fillEmpty: true,  unsettled: false }
  const force    = { fillEmpty: false, unsettled: true  }

  it('기존 행이 없으면 신규 기록이다', () => {
    expect(planDetailWrite(undefined, fill)).toBe('new')
    expect(planDetailWrite(undefined, fillDone)).toBe('new')
    expect(planDetailWrite(undefined, force)).toBe('new')
  })

  it('--fill-empty면 수기 행은 확정 여부와 무관하게 보존한다', () => {
    expect(planDetailWrite('manual', fill)).toBe('skip-manual')
    expect(planDetailWrite('manual', fillDone)).toBe('skip-manual')
  })

  it('--fill-empty 없이는 수기 행도 덮어쓴다', () => {
    expect(planDetailWrite('manual', force)).toBe('overwrite')
  })

  it('--fill-empty에서 파생 행은 미확정일 때만 다시 쓴다', () => {
    expect(planDetailWrite('derived', fill)).toBe('refresh')
    expect(planDetailWrite('derived', fillDone)).toBe('skip-settled')
  })

  it('--fill-empty 없이는 파생 행을 확정 여부와 무관하게 다시 쓴다', () => {
    expect(planDetailWrite('derived', force)).toBe('refresh')
    expect(planDetailWrite('derived', { fillEmpty: false, unsettled: false })).toBe('refresh')
  })

  it('모든 입력 조합이 다섯 판정 중 하나로만 떨어진다', () => {
    // 카운터가 '상호 배타 + 전수'이려면 판정 자체가 전역 함수여야 한다.
    const all: WriteAction[] = ['new', 'refresh', 'overwrite', 'skip-manual', 'skip-settled']
    const sources: (DetailSource | undefined)[] = [undefined, 'manual', 'derived']
    for (const s of sources) {
      for (const fillEmpty of [true, false]) {
        for (const unsettled of [true, false]) {
          expect(all).toContain(planDetailWrite(s, { fillEmpty, unsettled }))
        }
      }
    }
  })

  it('기록/보류가 정확히 셋·둘로 갈린다', () => {
    expect((['new', 'refresh', 'overwrite'] as WriteAction[]).every(isWriteAction)).toBe(true)
    expect((['skip-manual', 'skip-settled'] as WriteAction[]).some(isWriteAction)).toBe(false)
  })

  it('다섯 판정 모두 한국어 로그 라벨을 가진다', () => {
    const all: WriteAction[] = ['new', 'refresh', 'overwrite', 'skip-manual', 'skip-settled']
    all.forEach(a => expect(WRITE_ACTION_LABEL[a]).toBeTruthy())
  })

  // ── 불만과 VOC를 따로 판정해야 하는 실제 시나리오 ──
  // UI가 불만과 VOC를 서로 다른 모달·라우트로 저장하므로 두 출처는 실제로 갈릴 수 있다.

  it('불만 행이 아예 없는 버킷의 수기 VOC를 지우지 않는다', () => {
    // 사람이 VOC 키워드만 넣은 버킷. 불만만 보고 판정하면 '기존 행 없음'이라
    // --fill-empty에서도 통과해 수기 VOC가 삭제된다.
    const complaints = planDetailWrite(undefined, fill)
    const voc        = planDetailWrite('manual', fill)
    expect(complaints).toBe('new')
    expect(voc).toBe('skip-manual')
    expect(isWriteAction(complaints)).toBe(true)
    expect(isWriteAction(voc)).toBe(false)
  })

  it('파생 버킷의 VOC만 사람이 고쳤으면 그 VOC는 보존한다', () => {
    // 배치가 쓴 뒤 사람이 VOC만 교정한 경우(VOC=manual · 불만=derived).
    // 유예 7일 안이라 불만은 재분석 대상이지만 VOC는 건드리면 안 된다.
    const complaints = planDetailWrite('derived', fill)
    const voc        = planDetailWrite('manual', fill)
    expect(complaints).toBe('refresh')
    expect(voc).toBe('skip-manual')
  })

  it('반대로 불만만 수기면 VOC는 정상 기록된다', () => {
    expect(planDetailWrite('manual', fill)).toBe('skip-manual')
    expect(planDetailWrite(undefined, fill)).toBe('new')
  })
})

import {
  bandsFor, distColumnsFor, distFromRatings, OTA_SITE_BY_NAME,
  granularityForSite, granularityForOtaName,
} from './otaDetail'

describe('granularityForSite / granularityForOtaName', () => {
  it('일 단위 날짜를 안 주는 두 채널만 월 버킷이다', () => {
    expect(granularityForSite('에어비앤비')).toBe('month')
    expect(granularityForSite('여기어때')).toBe('month')
  })

  it('나머지 채널은 전부 주 버킷이다', () => {
    ;['아고다', '부킹닷컴', '트립닷컴', '익스피디아', '야놀자'].forEach(site => {
      expect(granularityForSite(site)).toBe('week')
    })
  })

  it('ota_name(앱 표기)으로도 같은 답이 나온다', () => {
    // 파생 배치는 raw_reviews.ota_site(한글), UI는 ota_properties.ota_name(영문)을 본다.
    // 두 표기가 다른 답을 내면 한 채널에 주 행과 월 행이 섞인다.
    expect(granularityForOtaName('Airbnb')).toBe('month')
    expect(granularityForOtaName('여기어때')).toBe('month')
    expect(granularityForOtaName('Agoda')).toBe('week')
    expect(granularityForOtaName('Booking')).toBe('week')
    expect(granularityForOtaName('Trip.com')).toBe('week')
    expect(granularityForOtaName('Expedia')).toBe('week')
    expect(granularityForOtaName('NOL')).toBe('week')
  })

  it('두 표기의 판정이 전 채널에서 일치한다', () => {
    Object.entries(OTA_SITE_BY_NAME).forEach(([name, site]) => {
      expect(granularityForOtaName(name)).toBe(granularityForSite(site))
    })
  })

  it('행이 하나도 없는 채널도 월 단위로 판정한다', () => {
    // 여기어때는 3개 지점 모두 ota_score_dist가 0행이다. '쌓인 행이 전부 month인가'로
    // 추론하던 입력 모달은 이 채널을 week로 판정해 월 단위 채널에 주 행을 쓸 수 있었다.
    // 이 함수는 데이터를 보지 않으므로 0행이어도 답이 흔들리지 않는다.
    expect(granularityForOtaName('여기어때')).toBe('month')
  })

  it('모르는 채널명은 주 단위가 기본값이다', () => {
    expect(granularityForOtaName('알 수 없는 채널')).toBe('week')
    expect(granularityForSite('알 수 없는 채널')).toBe('week')
  })
})

describe('bandsFor', () => {
  it('10점 채널은 1점대~10점 10밴드다', () => {
    // 부킹·트립·여기어때에 1.0점 리뷰가 실재하므로 1점대를 포함한다
    expect(bandsFor(10)).toEqual(['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점'])
  })

  it('5점 채널은 원척도 1~5점 5밴드다', () => {
    expect(bandsFor(5)).toEqual(['1점','2점','3점','4점','5점'])
  })
})

describe('distColumnsFor', () => {
  it('밴드 수만큼의 컬럼명을 준다', () => {
    expect(distColumnsFor(10)).toHaveLength(10)
    expect(distColumnsFor(10)[0]).toBe('score_1')
    expect(distColumnsFor(10)[9]).toBe('score_10')
    expect(distColumnsFor(5)).toEqual(['score_1','score_2','score_3','score_4','score_5'])
  })
})

describe('distFromRatings', () => {
  it('10점 채널의 점수를 내림해 밴드에 담는다', () => {
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.counts.score_10).toBe(2)
    expect(r.counts.score_8).toBe(2)
    expect(r.counts.score_9).toBe(1)
    expect(r.total).toBe(5)
  })

  it('평균은 밴드가 아니라 실제 rating으로 낸다', () => {
    // 밴드 중앙값이었다면 (10+10+8+8+9)/5 = 9.0으로 잘못 나온다
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.avg).toBe(9.3)
  })

  it('10점 채널의 1점대를 버리지 않는다', () => {
    const r = distFromRatings([1.0, 1.5, 2.0], 10)
    expect(r.counts.score_1).toBe(2)
    expect(r.counts.score_2).toBe(1)
  })

  it('5점 채널은 원척도 그대로 담는다', () => {
    const r = distFromRatings([5, 5, 4, 1], 5)
    expect(r.counts.score_5).toBe(2)
    expect(r.counts.score_4).toBe(1)
    expect(r.counts.score_1).toBe(1)
    expect(r.avg).toBe(3.8)
  })

  it('척도 밖 값은 양 끝 밴드로 클램프한다', () => {
    const r = distFromRatings([0, 11], 10)
    expect(r.counts.score_1).toBe(1)
    expect(r.counts.score_10).toBe(1)
  })

  it('정렬해서 넣으면 입력 순서가 달라도 같은 평균이 나온다', () => {
    // 실제 버킷(신설 Agoda 2026-06-29) — 참값 8.65로 반올림 경계에 정확히 걸려 있어
    // 부동소수점 합의 순서에 따라 8.6/8.7이 갈린다. 호출부에서 오름차순 정렬해 넘긴다.
    const asc = (a: number[]) => [...a].sort((x, y) => x - y)
    const a = [10, 8.4, 8.4, 8.0, 6.8, 7.6, 10, 10]
    const b = [6.8, 10, 8.0, 10, 8.4, 7.6, 10, 8.4]
    const c = [10, 10, 10, 8.4, 8.4, 8.0, 7.6, 6.8]
    expect(distFromRatings(asc(a), 10).avg).toBe(distFromRatings(asc(b), 10).avg)
    expect(distFromRatings(asc(a), 10).avg).toBe(distFromRatings(asc(c), 10).avg)
  })

  it('빈 입력은 avg 0, total 0이다', () => {
    const r = distFromRatings([], 10)
    expect(r.avg).toBe(0)
    expect(r.total).toBe(0)
    expect(r.counts.score_5).toBe(0)
  })
})

describe('OTA_SITE_BY_NAME', () => {
  it('ota_properties의 영문명을 raw_reviews의 한글명으로 옮긴다', () => {
    expect(OTA_SITE_BY_NAME['Agoda']).toBe('아고다')
    expect(OTA_SITE_BY_NAME['Booking']).toBe('부킹닷컴')
    expect(OTA_SITE_BY_NAME['Trip.com']).toBe('트립닷컴')
    expect(OTA_SITE_BY_NAME['Expedia']).toBe('익스피디아')
    expect(OTA_SITE_BY_NAME['Airbnb']).toBe('에어비앤비')
    expect(OTA_SITE_BY_NAME['NOL']).toBe('야놀자')
    expect(OTA_SITE_BY_NAME['여기어때']).toBe('여기어때')
  })
})
