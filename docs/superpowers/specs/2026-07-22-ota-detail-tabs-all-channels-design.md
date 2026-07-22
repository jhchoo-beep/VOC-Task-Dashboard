# 전 OTA 채널 상세 탭 — 설계

- 작성일: 2026-07-22
- 대상: voc-task-dashboard `OTA 점수 현황`
- 상태: 설계 확정

## 배경

`OTA 점수 현황 → 지점 → Agoda`에만 **`🔍 Agoda 상세`** 탭이 있다. 그 안에 리뷰 작성률 · 점수 분포 · 불만 분석 · VOC 4개 서브탭이 주별/월별로 붙어 있다. 같은 화면을 Booking·Trip.com·Expedia·Airbnb·NOL·여기어때에도 열어, 채널별로 무엇이 점수를 끌어내리는지 같은 해상도로 본다.

## 사실관계 (2026-07-22 실측)

설계 판단의 근거. 숫자가 바뀌면 설계도 다시 봐야 한다.

| 항목 | 실측 |
|---|---|
| 상세 4개 테이블 | 전부 `property_id` 키 — 스키마는 이미 OTA 무관. `lib/pageData.ts:72`가 `ota_name === 'Agoda'`로 필터를 걸어둔 것뿐 |
| 적재 현황 | 신설 Agoda만 실질 적재(분포 14주·VOC 174건·작성률 20주). 동대문 Agoda 극소량, **나머지 22개 조합 전부 0** |
| `raw_reviews` | 12,308건. `rating` **전 채널 100% 적재** |
| `reviews`(정제본) | 915건뿐 — 월 단위. 파생 소스로 부적합 |
| 중복 | 부킹닷컴 257건(14%). 나머지 채널 0~1건 |
| raw 커버리지 | Agoda는 사이트 총 리뷰의 **31~34%(표본)**, 나머지 채널은 ~100%(전수) |

### `raw_date` 형식 (채널별 실제 값)

| OTA | 형식 | 일 단위 | raw 건수 |
|---|---|---|---|
| 아고다 | `2026-07-21` | O | 5,802 |
| 트립닷컴 | `2026년 7월 22일` | O | 1,788 |
| 부킹닷컴 | `2026년 7월 17일` | O | 1,828 |
| 익스피디아 | `2026-07-20` | O | 445 |
| 야놀자(NOL) | `2026.07.04` | O | 249 |
| 에어비앤비 | `2026년 6월` | **X (월)** | 2,169 |
| 여기어때 | `2개월 전` | **X (상대값)** | 27 |

### 리뷰 작성률의 정체

`ota_agoda_review_rate.review_count`(17·28·24·24)를 `ota_scores` 주간 델타와 대조하면 **Agoda 델타와 일치**한다(17·28·23·24). 분자는 이미 매주 `collect-ota-scores`가 수집하는 스냅샷의 증가분이고, 분모 `checkout_count`(119~147)는 **지점 전체 주간 체크아웃**이다. 즉 신규 수집 없이 전 채널로 확장 가능하다.

## 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| 1 | 데이터는 `raw_reviews`에서 **파생**한다 | 이미 쌓인 데이터. 채널별 주간 수집 작업을 7배로 늘리지 않는다 |
| 2 | **4개 서브탭 전부** 동일하게 제공 | 채널 간 비교가 목적이라 화면이 달라지면 비교가 깨진다 |
| 3 | 불만·VOC는 **LLM 배치 스크립트** | 규칙 기반은 맥락·반어를 못 읽어 오탐이 난다. 수집 작업은 늘지 않는다(DB에 이미 있는 본문을 읽는다) |
| 4 | Agoda도 같은 파생 경로로 **통일** | 산출 경로가 둘이면 유지보수가 갈라진다 |
| 5 | 백필은 **수기 입력만 보호한다**(최근 4주·4개 지점). ~~빈 칸만 채운다~~ | 신설 Agoda 14주 수기 데이터를 덮어쓰지 않는다. 다음 주부터 파이프라인이 이어받는다. **구현 중 변경 — 아래 참조** |

> **결정 #5 변경 (구현 중, 2026-07-22)**
>
> 원안은 `--fill-empty`를 "그 키에 행이 있으면 건너뛴다"로 정의했다. 구현하며 이 규칙이
> 보호하려던 것(사람이 넣은 값)이 아니라 **엉뚱한 것(자기가 방금 쓴 부분값)까지** 얼려
> 버린다는 것이 드러나 폐기했다.
>
> - 대상 주에는 **항상 아직 끝나지 않은 이번 주**가 들어 있다. 첫 실행이 쓴 7일 중 3일치
>   부분값이 그대로 영구히 굳는다.
> - 뒤늦게 들어오는 리뷰도 같은 이유로 영영 반영되지 않는다. 실측: 에어비앤비 한 달치의
>   **14~52%가 그 달이 끝난 뒤에 적재**됐다(`review_month` 2026-06은 47건 중 6건, 2026-05는
>   51건 중 18건, 2026-04는 54건 중 28건).
>
> 그래서 판단 기준을 '행의 존재'에서 **행의 출처(`source` 컬럼, `'manual' | 'derived'`)** 로
> 바꿨다. 세 테이블에 `source text not null default 'manual'`을 두고, UI 입력은 `manual`,
> 파생 배치가 쓰는 행은 항상 `derived`로 적는다. `--fill-empty`의 새 의미는:
>
> | 기존 행 | 동작 |
> |---|---|
> | 없음 | 신규 기록 |
> | `manual` | **건드리지 않는다** (사람 손이 닿은 값) |
> | `derived` · 점수 분포 | 매 실행 다시 계산해 덮어쓴다 (LLM을 안 타 재계산이 사실상 공짜) |
> | `derived` · 불만/VOC · 미확정 버킷 | 다시 분석해 덮어쓴다 |
> | `derived` · 불만/VOC · 확정 버킷 | 건너뛴다 (본문 판독 비용을 반복해 치르지 않는다) |
>
> '미확정'은 구간이 아직 안 끝났거나 끝난 지 `SETTLE_GRACE_DAYS`(7일) 이내인 버킷이다.
> 출처는 표마다 따로 읽고 따로 판정한다 — UI가 불만과 VOC를 다른 모달로 저장해 한쪽만
> 사람이 고쳐 놓을 수 있기 때문이다. `ota_voc`처럼 키 하나에 행이 여럿인 표는 **한 행이라도
> 수기면 그 키 전체를 `manual`로** 본다.
| 6 | 5점 만점 채널은 **원척도 밴드**(1~5) | ×2 환산하면 별 4개가 8점대로 보이고 중간 밴드가 통째로 빈다 |
| 7 | 에어비앤비·여기어때는 **월별만** | 데이터를 숨기지 않고 한계를 화면에 명시한다 |

## 설계

### 1. 데이터 레이어

**테이블 일반화** — 이름만 바꾸고 행·키 구조는 그대로 둔다. 기존 신설 Agoda 데이터는 무손실 이관된다.

```
ota_agoda_score_dist  → ota_score_dist
ota_agoda_complaints  → ota_complaints
ota_agoda_voc         → ota_voc
ota_agoda_review_rate → (해체, 아래 참조)
```

**스키마 변경 2건**

1. `ota_score_dist`에 `score_1 integer` 추가. 5점 채널은 `score_1`~`score_5`(정수 1~5, 실측 확인)를 쓴다. **10점 채널도 `score_1`이 필요하다** — 부킹닷컴·트립닷컴·여기어때에 1.0점 리뷰가 실재한다(Agoda는 척도가 2점부터 시작해 기존 스키마에 없었을 뿐). 따라서 10점 채널 밴드는 기존 9밴드가 아니라 **1점대~10점 10밴드**가 된다. UI는 `ota_properties.score_max`로 밴드 라벨을 전환한다.
2. `ota_score_dist` · `ota_complaints` · `ota_voc`에 `granularity text not null default 'week'` 추가 — `'week' | 'month'`. 에어비앤비·여기어때는 `'month'`로 적재하며 `week_start`에 해당 월 1일을 넣는다. 컬럼을 새로 두는 이유는, 월 1일이 우연히 주 시작일과 겹칠 때 주간 행과 월간 행이 구분되지 않기 때문이다.

   unique 제약은 **`ota_score_dist`·`ota_complaints` 두 표만** `(property_id, week_start)` → `(property_id, week_start, granularity)`로 교체한다 — 교체하지 않으면 같은 property의 월간 행이 주간 행과 충돌해 조용히 덮어쓴다. **`ota_voc`에는 unique 제약이 없고, 원래도 없었다**(초안의 "세 테이블" 표기는 사실과 다르다). 한 버킷에 키워드 행이 여럿 달리는 것이 정상이라 키를 유일하게 만들 수 없다. 그래서 VOC만 upsert가 아니라 **같은 키를 지우고 다시 넣는** 경로를 쓰며, `delete` 실패를 반드시 확인해야 한다(놓치면 기존 행 위에 insert가 더해져 중복이 쌓인다).

**`ota_agoda_review_rate` 해체**

분자는 저장하지 않고 파생한다. `ota_scores`의 주간 스냅샷 델타가 채널별 신규 리뷰 수(전수)다. 델타가 음수인 주(리뷰 삭제)는 0으로 클램프한다.

분모만 신규 테이블로 남긴다. 지점 공용값이므로 `property_id`에 매달 이유가 없다.

```sql
create table ota_branch_checkouts (
  id          bigserial primary key,
  branch      text not null,
  week_start  date not null,
  checkout_count integer not null,
  created_at  timestamptz default now(),
  unique (branch, week_start)
);
```

기존 `ota_agoda_review_rate`의 신설 20주치 `checkout_count`를 `branch='신설'`로 이관한 뒤 원 테이블을 드롭한다.

### 2. 파생 배치 — `scripts/derive-ota-detail.ts`

`(지점 × 채널 × 기간)` 버킷 단위로 돌며 멱등 upsert한다.

**단계**

1. **날짜 정규화** — 순수 함수 `parseRawDate(otaSite, rawDate, reviewMonth)` → `{ date: string | null, month: string }`. 5종 파서: ISO / `YYYY년 M월 D일` / `YYYY.MM.DD` / `YYYY년 M월`(월only) / 상대값(`review_month`로 대체). 파싱 실패는 `null`을 반환하고 **버리지 않고 카운트해 로그로 보고**한다.
2. **dedup** — `(branch, reviewer, raw_date, rating, left(content,80))` 기준. 부킹 257건이 여기서 걸러진다.
3. **점수 분포** — `rating` 집계. **LLM을 타지 않는다.** 재실행 시 값이 같아야 하고 검산이 가능해야 한다. 10점 채널은 `floor(rating)` → `score_1`~`score_10`(10.0은 `score_10`), 5점 채널은 `score_1`~`score_5`. `weekly_avg_score`는 실제 `rating` 평균(밴드 중앙값 추정이 아니다).
4. **불만 · VOC** — 버킷의 리뷰 본문을 묶어 LLM에 넘긴다. 산출은 `{room_complaints, bathroom_complaints, memo}`와 `{band, sentiment, keyword}[]`. 기존 Agoda 산출물과 같은 형식이라 화면 변경이 없다.
5. **upsert** — `(property_id, week_start, granularity)` 충돌 시 갱신. `ota_voc`는 해당 키의 기존 행을 지우고 다시 넣는다(키워드 목록은 누적이 아니라 대체).

**수기 입력 보호 모드** — `--fill-empty` 플래그. 백필도 주간 정기 실행도 이 모드로만 실행한다.

판단 기준은 **행의 존재가 아니라 행의 출처(`source`)** 다(결정 #5 변경 참조). 원안의 '행이 있으면 건너뛴다'는 아직 끝나지 않은 이번 주의 부분값을 영구히 얼리고, 뒤늦게 들어오는 리뷰(에어비앤비 실측 14~52%)를 영영 버렸다. 새 규칙은:

- `source='manual'` — 절대 건드리지 않는다.
- `source='derived'` · 점수 분포 — 매 실행 다시 계산해 덮어쓴다. 재계산이 결정론적이고 싸므로 확정 여부를 따지지 않는다.
- `source='derived'` · 불만·VOC — **미확정 버킷일 때만** 다시 분석한다. 확정된 버킷은 건너뛴다.

플래그를 빼면 수기 입력까지 덮어쓰며, 몇 건이 걸리는지 배너 경고로 크게 알린다.

### 3. 앱 레이어

**`lib/pageData.ts`**
- `agodaProps` 필터 제거. 전 `active` property를 대상으로 한다.
- 반환 구조를 한 겹 확장: `Record<지점, 데이터[]>` → `Record<지점, Record<OTA, 데이터[]>>`.
- 키 이름에서 `agoda` 제거: `agodaDist`→`scoreDist`, `agodaComplaints`→`complaints`, `agodaVoc`→`voc`, `agodaReviewRate`→`reviewRate`. `complaintMemos`는 이름은 그대로 두되 `Record<지점, Record<OTA, string>>`으로 함께 한 겹 확장한다.
- `reviewRate`는 DB에서 읽지 않고 `ota_scores` 델타 + `ota_branch_checkouts`로 조립한다.

**`components/OtaScoresClient.tsx`**
- `ota === 'Agoda'` 게이트(1415·1430·1436행) 제거. 탭 라벨은 `🔍 {ota} 상세`.
- `AgodaDetailTabs` → `OtaDetailTabs`, 시그니처에 `ota: string` 추가. 내부의 `'Agoda'` 하드코딩(708·709·712행)을 `ota`로 치환.
- 히트맵 밴드를 `score_max`에 따라 전환: 10점형 `1점대~10점`(10밴드) / 5점형 `1점~5점`(5밴드). `HEATMAP_BANDS` 상수를 `bandsFor(scoreMax)` 함수로 교체. 10점형이 9밴드가 아닌 이유는 위 스키마 변경 1번과 같다 — 부킹·트립·여기어때에 1.0점 리뷰가 실재한다.
- `granularity === 'month'`인 채널은 주별 토글을 비활성화하고 사유를 표기한다: "이 채널은 OTA가 월 단위 날짜만 제공합니다".
- 데이터가 없는 채널은 기존 `데이터 없음` 표시를 그대로 쓴다(빈 화면이 아니라 상태가 보여야 한다).

**입력 모달** — 체크아웃 수 입력을 `ota_branch_checkouts` 대상으로 바꾼다(지점 단위 1회 입력). 나머지 3종 수동 입력은 파생 배치로 대체되므로 읽기 경로만 남기고 손대지 않는다.

**쓰기 API** — `app/api/ota/agoda-dist`·`agoda-voc` 라우트의 테이블명을 갱신한다. 신규 쓰기 경로를 추가하면 `revalidateTag('ota', 'max')`를 반드시 호출한다(누락 시 최대 300초간 반영 안 됨 — 기존에 겪은 함정).

### 4. 백필

- 범위: **4개 지점 × 전 채널 × 최근 4주**, `--fill-empty` 모드. 2026-07-22 실행 기준 `week_start` = 06-29 · 07-06 · 07-13 · 07-20(월요일 시작, 기존 Agoda 데이터와 같은 기준).
- 신설 Agoda 14주와 동대문 Agoda 기존 행은 자동 보존된다.
- 에어비앤비·여기어때는 같은 기간에 해당하는 **최근 1개월 버킷**으로 채운다.
- 다음 주부터는 주간 정기 실행이 새 주를 이어서 채운다.

## 검증

- `parseRawDate` 단위테스트(vitest) — 7개 채널 실데이터 표본 + 파싱 실패 케이스.
- 점수 분포 파생 로직 단위테스트 — 10점/5점 채널, 경계값(10.0, 5.0, 2.0).
- **대조표**: 신설 Agoda 최근 4주를 `--dry-run`으로 파생해 기존 수기값과 나란히 출력한다. 표본 31%라 분포 모양이 다를 수 있으며, 차이는 덮어쓰지 않고 **보고만** 한다.
- `tsc` + 프로덕션 빌드 통과.
- 라이브 확인은 Google OAuth 뒤라 프로덕션 빌드(`next start`)로 e2e — dev 서버는 이 환경에서 하이드레이션이 안 된다(기존 함정).

## 범위 밖

- 에어비앤비 파서를 일 단위로 고치는 일 (과거 2,169건은 어차피 월 단위라 소급 불가)
- Agoda raw 커버리지를 31%에서 끌어올리는 일
- 심각도 체계 재설계
