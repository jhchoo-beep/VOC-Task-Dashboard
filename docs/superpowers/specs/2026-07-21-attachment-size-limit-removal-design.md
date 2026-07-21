# 진행사항 첨부 용량 제한 해제 — 설계

- 날짜: 2026-07-21
- 대상: voc-task-dashboard 수행과제 진행사항 사진 첨부
- 관련: [[2026-06-15-task-log-photo-attachment]] (최초 첨부 기능)

## 배경 / 문제

수행과제 진행사항에 사진 첨부 시 **파일당 10MB / 최대 5장** 제한이 있다. 그런데 5장을
FormData 하나에 담아 **단일 POST**로 보내는데, 배포처 Vercel 서버리스 함수의 **요청 본문
상한이 4.5MB(플랫폼 하드 리밋)**다. 따라서 코드의 `MAX_BYTES`(10MB) 체크를 제거해도
4.5MB를 넘는 요청은 우리 검증 로직에 닿기 전에 Vercel이 413으로 막는다.
즉 "코드 한 줄 삭제"로는 제한이 실제로 사라지지 않는다.

## 목표

사용자 체감 "용량 무제한" — 현장에서 폰 사진을 (5장까지) 어떤 크기로 올려도 막히지 않게.
※ **장수 5장 제한은 이번 범위 아님**(용량=파일 크기 한정). 유지.

## 방식 (택: 업로드 전 자동 압축)

1. **업로드 직전 브라우저 압축** — 각 이미지를 Canvas로 긴 변 최대 2048px로 리사이즈 +
   JPEG(품질 0.82)로 재인코딩. 일반 폰 원본 5~8MB → 수백 KB~1.5MB. 문서용 화질 충분.
2. **사진 1장씩 개별 전송** — 단일 배치 POST를 **1장당 1회 POST(순차)**로 전환.
   각 요청이 압축된 1장만 실어 4.5MB 벽을 원천 회피. 한 장 실패 시 몇 번째인지 알림.

## 컴포넌트 / 파일

### 신규 `lib/imageCompress.ts`
- `fitDimensions(w, h, maxEdge)` — 종횡비 유지하며 긴 변을 maxEdge로 축소한 정수 치수 반환.
  **확대는 하지 않음**(원본이 이미 작으면 그대로). 순수 함수 → 단위 테스트 대상.
- `compressImage(file, opts?)` — 브라우저 전용. Canvas로 리사이즈·재인코딩해 새 `File` 반환.
  - 디코드 실패(미지원 포맷 등)·결과가 원본보다 크면 **원본 그대로 폴백**.
  - 상수: `MAX_EDGE = 2048`, `QUALITY = 0.82`.

### `lib/driveUrl.ts`
- `MAX_BYTES` 상수와 `validateUploads`의 크기 검사 **제거**.
- **유지**: 빈 파일 검사, `MAX_FILES`(5장) 검사, 이미지 타입 검사.

### `lib/drive.ts`
- `MAX_BYTES` 재export 제거.

### `components/TasksClient.tsx`
- `addLog`의 업로드 블록을 **압축 → 개별 업로드 루프**로 교체.
  각 사진: `compressImage()` → 단일 파일 FormData POST → attachment 수집.
  실패 시 `"N번째 사진 업로드 실패"` 알림 후 중단(입력·나머지 사진 유지).

### `app/api/tasks/logs/upload/route.ts`
- 변경 없음(단일 파일 요청도 기존 배열 처리로 동작). `validateUploads`는 크기 검사만 빠진 채 유지.

## 테스트

- `lib/imageCompress.test.ts` — `fitDimensions` 축소·비축소·종횡비·정수화.
- `lib/drive.test.ts` — `MAX_BYTES` 테스트 제거, 큰 이미지도 `validateUploads` 통과 확인 추가.
- tsc + 프로덕션 빌드 통과. (라이브는 Google OAuth 뒤라 Canvas 실동작 e2e는 생략,
  순수 로직 단위 테스트로 대체.)

## 참고 / 한계

- iOS 사진 선택은 대개 JPEG로 넘어와 Canvas 압축이 정상 동작. HEIC 등 브라우저가 못 여는
  포맷이면 압축을 건너뛰고 원본 전송 → 극단적으로 큰 원본만 드물게 413. 이 경우 Vercel
  자체 한도가 최종 안전장치.
