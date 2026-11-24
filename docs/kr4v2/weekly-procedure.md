# KR4 STAY VOC 2.0 — 주간 불편 분석 절차

- 화면: `/kr4-voc2`(노션 임베드 `/embed/kr4-voc2`). 이 화면의 불편 지수는 `voc_review_analysis`(분모 = 분석한 리뷰)와 `voc_stars` 불편 별(분자)을 읽는다.
- 이 절차는 그 주에 새로 파싱된 `reviews`를 LLM으로 분석해 두 표에 넣는다. 월요일 「VOC 주간 파이프라인 대행」 루틴이 `/parse-reviews` 다음 단계(Part D)로 돌린다. 사람이 손으로 돌릴 때도 같다.
- 별 추출 규칙의 정본은 `docs/kr4v2/star-extraction-prompt.md`다. 이 문서는 순서와 게이트만 정한다.
- 목적 점수(신규 리뷰 평점, `kr4_runs`)는 이 절차가 아니다. 박일우 님 쪽 주간 실행이 채운다.

## 0. 준비

- 작업 폴더 `<W>` = 세션 임시 폴더 아래 새 폴더(예: `kr4v2-YYYYMMDD`). 리포 안에 만들지 않는다.
- 키는 Supabase MCP `get_publishable_keys`(project_id `slyfyrkqfdkoaaochspa`)로 받아 명령줄 환경변수로만 쓴다. 파일에 적지 않는다.
- 태그 `<TAG>` = `llm-kr4v2-<오늘 날짜 YYYY-MM-DD>`.

## 1. 대상 고르기 (읽기만)

```bash
SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co SUPABASE_KEY=<키> npx tsx scripts/kr4v2/prepare.ts <W>
```

- 기본 창은 오늘 28일 전부터 오늘까지다. 아직 `voc_review_analysis`에 없는 리뷰만 고른다.
- 이미 분석한 리뷰와 같은 지점·채널에서 본문 앞 60자가 같은 사본은 대상에서 뺀다(`dupSkipped`). 사본을 넣으면 분모가 부푼다.
- 결과: `targets.json`(전체 대상), `batch-NN.json`(원문 있는 리뷰 40건씩), `phenomena.json`(현상 사전).
- `targets`가 0이면 2~4단계를 건너뛰고 보고만 한다(정상).

## 2. 별 추출 (LLM)

- 배치마다 `star-extraction-prompt.md` 1~4절 규칙과 `phenomena.json`을 보고 `out-NN.json`을 쓴다(형식은 그 문서 3절).
- `reviews` 칸에는 입력 리뷰 id 앞 8자를 **전부** 넣는다(별이 없는 리뷰 포함).
- 발췌는 입력의 `ko`에 그대로 있는 구절만 쓴다. 고치거나 요약하지 않는다.
- 현상 사전에 같은 현상이 있으면 그 이름을 글자 그대로 쓰고, 은하·받는 쪽도 사전 값을 따른다.
- 칭찬 별도 뽑는다(`pos_count`에 쓰인다). 적재는 불편 별만 한다.

## 3. 검증 + SQL 만들기 (DB에 쓰지 않음)

```bash
npx tsx scripts/kr4v2/build-sql.ts <W> --tag <TAG>
```

- 게이트: `검증 오류 0건`, `사전과 은하·받는 쪽이 다른 현상 0건`. 하나라도 있으면 SQL을 만들지 않고 종료 코드 1로 끝난다 → 해당 배치의 `out-NN.json`을 고쳐 다시 돌린다. 두 번 고쳐도 안 되면 멈추고 보고한다.
- `새 현상 이름`은 오류가 아니다. 보고에 목록을 그대로 싣는다.
- 결과: `analysis.sql`, `stars-0.sql`(불편 별이 많으면 `stars-1.sql`…).

## 4. 적재 (Supabase MCP `execute_sql`)

`voc_review_analysis`·`voc_stars`는 RLS가 켜져 있어 anon 키로 쓸 수 없다. 파일 내용을 그대로 `execute_sql`에 넣는다.

1. 적재 전 조회: `select count(*) from voc_review_analysis` / `select max(substr(id,3)::int) from voc_stars`
2. `analysis.sql` 실행 → `stars-0.sql`, `stars-1.sql`… 순서대로 실행(별 SQL은 분석 행에 join하므로 순서를 바꾸지 않는다)
3. 적재 후 조회로 대조:
   ```sql
   select count(*), sum(neg_count) from voc_review_analysis where extracted_by = '<TAG>';
   select count(*) from voc_stars where extracted_by = '<TAG>';
   ```
   분석 행 수 = `targets.json` 건수, 별 수 = `sum(neg_count)` = build-sql이 찍은 불편 별 수여야 한다. 다르면 보고한다.

- `analysis.sql`은 `on conflict do nothing`이라 다시 돌려도 안전하다.
- 별 SQL은 고유 키(원천·리뷰·극성·현상)에 걸리면 문 전체가 실패하고 아무것도 들어가지 않는다. 분석 행은 들어갔는데 별 SQL이 실패하면 다음 주 `prepare.ts`가 그 리뷰를 다시 고르지 않으므로, 멈추고 해당 `<TAG>`와 오류를 보고한다. 지우거나 고쳐서 통과시키지 않는다.

## 5. 금지

- `voc_review_analysis`·`voc_stars`의 기존 행을 지우거나 고치지 않는다. 이 절차는 추가만 한다.
- 기존 별 ID를 바꾸지 않는다(새 별은 마지막 번호 다음부터).
- `reviews`·`raw_reviews`는 읽기만 한다.

## 6. 보고에 넣을 것

- 대상 N건(원문 있는 N / 원문 없음 N / 사본 제외 N), 지점별 건수
- 불편 별 N개 · 칭찬 별 N개, 새 현상 이름 목록
- 적재 대조 결과(분석 행 수·별 수 일치 여부)
- 관계 신호가 붙은 별(평판 리스크 등)이 있으면 지점·현상·발췌 한 줄씩
