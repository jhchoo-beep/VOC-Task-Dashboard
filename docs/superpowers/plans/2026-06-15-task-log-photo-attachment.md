# 진행사항 사진 첨부 (Google Drive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수행과제 진행사항(`task_logs`) 글에 사진(최대 5장)을 함께 첨부하고, MGRV 워크스페이스 Drive에 서비스 계정으로 저장해 임베드 포함 모든 뷰에서 썸네일로 본다.

**Architecture:** 클라이언트가 사진을 `/api/tasks/logs/upload`(multipart)로 보내면 서버가 서비스 계정으로 Drive 전용 폴더에 업로드하고 `anyone:reader` 권한을 부여한 뒤 `fileId`를 돌려준다. 기존 진행사항 생성 API(`POST /api/tasks/logs`)는 `attachments`(fileId 배열)를 추가로 받아 `task_logs.attachments` JSONB 컬럼에 저장한다. 표시 URL은 `fileId`로 렌더 시점에 조립한다.

**Tech Stack:** Next.js 16 (App Router, Node 런타임), Supabase(PostgreSQL), `googleapis`(Drive v3), vitest(순수 함수 단위 테스트).

---

## 선행 작업 (구현 시작 전, 워크스페이스 관리자 — 재헌님)

코드는 아래 환경변수가 있다고 가정한다. 실제 값이 없어도 **순수 함수 테스트와 빌드는 통과**하도록 설계했고, 업로드 실제 동작 검증(Task 9)에서만 필요하다.

1. Google Cloud Console → 프로젝트에서 **서비스 계정** 생성 → JSON 키 발급, **Drive API Enable**.
2. Drive에 **VOC 사진 전용 폴더** 생성 → 폴더를 서비스 계정 이메일(`...@...iam.gserviceaccount.com`)에 **편집자**로 공유 → 폴더 ID 확보.
3. `.env.local`·Vercel 환경변수 등록:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = 키 JSON 전체(한 줄 문자열)
   - `DRIVE_VOC_FOLDER_ID` = 폴더 ID

---

## File Structure

- **신규** `lib/drive.ts` — 순수 헬퍼(URL 조립, 업로드 검증)와 Drive I/O(업로드/삭제)를 한 파일에. 순수 헬퍼만 테스트한다.
- **신규** `lib/drive.test.ts` — 순수 헬퍼 단위 테스트.
- **신규** `app/api/tasks/logs/upload/route.ts` — multipart 업로드 엔드포인트.
- **수정** `app/api/tasks/logs/route.ts` — POST가 `attachments` 수신.
- **수정** `app/api/tasks/logs/delete/route.ts` — 삭제 시 Drive 파일 best-effort 삭제.
- **수정** `components/TasksClient.tsx` — 입력부 사진 버튼·미리보기, 로그 렌더 썸네일.
- **수정** `supabase/schema.sql` — `attachments` 컬럼.
- **수정** `package.json` — `googleapis` 의존성.
- **수정** `CLAUDE.md` — `task_logs` 스키마·환경변수 문서.

---

### Task 1: 의존성 추가 + DB 마이그레이션

**Files:**
- Modify: `package.json` (googleapis)
- Modify: `supabase/schema.sql:46-52`

- [ ] **Step 1: googleapis 설치**

Run:
```bash
npm install googleapis
```
Expected: `package.json`·`package-lock.json`에 `googleapis` 추가, 에러 없음.

- [ ] **Step 2: schema.sql에 컬럼 추가**

`supabase/schema.sql`의 `task_logs` 테이블 정의(현재 46-52행) 바로 아래에 다음을 추가한다:

```sql
-- 진행 로그 첨부 사진 (Google Drive fileId 배열, 최대 5)
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 3: 라이브 Supabase에 마이그레이션 적용**

Supabase MCP `apply_migration`(project_id: `slyfyrkqfdkoaaochspa`, name: `task_logs_attachments`)로 위 `ALTER TABLE` 문을 실행한다. (MCP 불가 시 Supabase 대시보드 SQL 편집기에서 동일 SQL 실행)

Expected: 성공. `list_tables` 또는 `select attachments from task_logs limit 1`로 컬럼 존재 확인.

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json supabase/schema.sql
git commit -m "feat: task_logs attachments 컬럼 + googleapis 의존성"
```

---

### Task 2: `lib/drive.ts` 순수 헬퍼 (URL 조립 + 업로드 검증) — TDD

**Files:**
- Create: `lib/drive.ts`
- Test: `lib/drive.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/drive.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { driveThumbUrl, driveViewUrl, validateUploads, MAX_FILES, MAX_BYTES } from './drive'

describe('driveThumbUrl', () => {
  it('fileId로 썸네일 URL을 만든다 (기본 사이즈 w1000)', () => {
    expect(driveThumbUrl('ABC123')).toBe('https://drive.google.com/thumbnail?id=ABC123&sz=w1000')
  })
  it('사이즈를 지정할 수 있다', () => {
    expect(driveThumbUrl('ABC123', 400)).toBe('https://drive.google.com/thumbnail?id=ABC123&sz=w400')
  })
})

describe('driveViewUrl', () => {
  it('fileId로 원본 열기 URL을 만든다', () => {
    expect(driveViewUrl('ABC123')).toBe('https://drive.google.com/file/d/ABC123/view')
  })
})

describe('validateUploads', () => {
  const img = (size: number, type = 'image/jpeg') => ({ size, type })

  it('이미지 1~5장은 통과한다', () => {
    expect(validateUploads([img(1000), img(2000)])).toEqual({ ok: true })
  })
  it('파일이 없으면 실패한다', () => {
    expect(validateUploads([])).toEqual({ ok: false, error: '파일이 없습니다' })
  })
  it(`${MAX_FILES}장을 초과하면 실패한다`, () => {
    const many = Array.from({ length: MAX_FILES + 1 }, () => img(1000))
    expect(validateUploads(many)).toEqual({ ok: false, error: `사진은 최대 ${MAX_FILES}장까지 첨부할 수 있습니다` })
  })
  it('이미지가 아니면 실패한다', () => {
    expect(validateUploads([img(1000, 'application/pdf')])).toEqual({ ok: false, error: '이미지 파일만 첨부할 수 있습니다' })
  })
  it(`${MAX_BYTES}바이트를 초과하면 실패한다`, () => {
    expect(validateUploads([img(MAX_BYTES + 1)])).toEqual({ ok: false, error: '각 사진은 10MB 이하만 가능합니다' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/drive.test.ts`
Expected: FAIL — `lib/drive.ts` 모듈/내보내기 없음.

- [ ] **Step 3: 순수 헬퍼 구현**

`lib/drive.ts` (이 파일은 Task 3에서 I/O 함수가 추가된다. 우선 순수 헬퍼만 작성):

```typescript
export const MAX_FILES = 5
export const MAX_BYTES = 10 * 1024 * 1024 // 10MB

export function driveThumbUrl(fileId: string, width = 1000): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

type UploadLike = { size: number; type: string }
type ValidateResult = { ok: true } | { ok: false; error: string }

export function validateUploads(files: UploadLike[]): ValidateResult {
  if (files.length === 0) return { ok: false, error: '파일이 없습니다' }
  if (files.length > MAX_FILES) return { ok: false, error: `사진은 최대 ${MAX_FILES}장까지 첨부할 수 있습니다` }
  for (const f of files) {
    if (!f.type.startsWith('image/')) return { ok: false, error: '이미지 파일만 첨부할 수 있습니다' }
    if (f.size > MAX_BYTES) return { ok: false, error: '각 사진은 10MB 이하만 가능합니다' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/drive.test.ts`
Expected: PASS (모든 케이스).

- [ ] **Step 5: 커밋**

```bash
git add lib/drive.ts lib/drive.test.ts
git commit -m "feat: lib/drive 순수 헬퍼(URL 조립·업로드 검증)"
```

---

### Task 3: `lib/drive.ts` Drive I/O (업로드/삭제)

**Files:**
- Modify: `lib/drive.ts`

I/O는 외부 네트워크라 단위 테스트하지 않는다(실동작은 Task 9에서 검증). 얇게 유지한다.

- [ ] **Step 1: 업로드/삭제 함수 추가**

`lib/drive.ts` 상단에 import를 추가하고, 파일 끝에 함수를 추가한다:

```typescript
import { google } from 'googleapis'
import { Readable } from 'node:stream'

export type Attachment = { fileId: string; name: string }

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const folderId = process.env.DRIVE_VOC_FOLDER_ID
  if (!raw || !folderId) throw new Error('Drive 환경변수(GOOGLE_SERVICE_ACCOUNT_JSON / DRIVE_VOC_FOLDER_ID)가 없습니다')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] })
  return { drive: google.drive({ version: 'v3', auth }), folderId }
}

/** 버퍼를 전용 폴더에 업로드하고 '링크 있는 누구나 보기' 권한을 부여한 뒤 fileId를 반환한다. */
export async function uploadImage(buffer: Buffer, filename: string, mime: string): Promise<Attachment> {
  const { drive, folderId } = driveClient()
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: 'id, name',
  })
  const fileId = created.data.id!
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } })
  return { fileId, name: created.data.name ?? filename }
}

/** best-effort 삭제. 실패해도 throw하지 않는다. */
export async function deleteImage(fileId: string): Promise<void> {
  try {
    const { drive } = driveClient()
    await drive.files.delete({ fileId })
  } catch (e) {
    console.error('[drive] 파일 삭제 실패:', fileId, e)
  }
}
```

- [ ] **Step 2: 기존 테스트가 여전히 통과하는지 확인 (import 회귀 없음)**

Run: `npx vitest run lib/drive.test.ts`
Expected: PASS — 순수 헬퍼 테스트는 그대로 통과(I/O 함수는 호출되지 않으므로 환경변수 불필요).

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add lib/drive.ts
git commit -m "feat: lib/drive Drive 업로드/삭제(서비스 계정)"
```

---

### Task 4: 업로드 API `POST /api/tasks/logs/upload`

**Files:**
- Create: `app/api/tasks/logs/upload/route.ts`

- [ ] **Step 1: 라우트 작성**

```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { uploadImage, validateUploads, type Attachment } from '@/lib/drive'

export const runtime = 'nodejs' // googleapis는 Node 런타임 필요(edge 불가)

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)

  const valid = validateUploads(files.map(f => ({ size: f.size, type: f.type })))
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

  try {
    const attachments: Attachment[] = []
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer())
      attachments.push(await uploadImage(buffer, f.name || 'photo.jpg', f.type))
    }
    return NextResponse.json({ attachments })
  } catch (e: any) {
    console.error('[upload] Drive 업로드 실패:', e)
    return NextResponse.json({ error: '사진 업로드에 실패했습니다' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입 체크 + 빌드(라우트 인식 확인)**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/tasks/logs/upload/route.ts
git commit -m "feat: 진행사항 사진 업로드 API(/api/tasks/logs/upload)"
```

---

### Task 5: `POST /api/tasks/logs`가 attachments 수신

**Files:**
- Modify: `app/api/tasks/logs/route.ts:22-34`

- [ ] **Step 1: 본문 파싱과 insert에 attachments 반영**

현재 26-32행을 다음으로 교체한다:

```typescript
  const { taskId, content, author: bodyAuthor, attachments } = await req.json()
  if (!taskId || !content?.trim()) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const author = bodyAuthor?.trim() || (session.user?.name ?? session.user?.email ?? '사용자')
  const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 5) : []

  const { data, error } = await supabase
    .from('task_logs').insert({ task_id: taskId, author, content, attachments: safeAttachments }).select().single()
```

(나머지 슬랙 알림 로직·`after()`는 그대로 둔다.)

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/tasks/logs/route.ts
git commit -m "feat: 진행사항 생성 시 attachments 저장"
```

---

### Task 6: `DELETE /api/tasks/logs/delete`가 Drive 파일도 정리

**Files:**
- Modify: `app/api/tasks/logs/delete/route.ts`

- [ ] **Step 1: 삭제 전 attachments 조회 → 행 삭제 → Drive best-effort 삭제**

파일 전체를 다음으로 교체한다:

```typescript
import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse, after } from 'next/server'
import { deleteImage, type Attachment } from '@/lib/drive'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  // 삭제 전에 첨부 fileId를 확보(행 삭제 후엔 못 읽음)
  const { data: log } = await supabase.from('task_logs').select('attachments').eq('id', id).single()

  const { error } = await supabase.from('task_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const attachments: Attachment[] = Array.isArray(log?.attachments) ? log!.attachments : []
  if (attachments.length > 0) {
    after(async () => {
      for (const a of attachments) await deleteImage(a.fileId)
    })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/tasks/logs/delete/route.ts
git commit -m "feat: 진행사항 삭제 시 Drive 파일 best-effort 정리"
```

---

### Task 7: UI — 입력부 사진 첨부 + 미리보기 + 업로드 흐름

**Files:**
- Modify: `components/TasksClient.tsx` (상태 추가, `addLog` 수정, import, 입력부 JSX)

컴포넌트 테스트는 이 프로젝트에 없으므로 수동 검증(Task 9)으로 대체한다.

- [ ] **Step 1: import에 사진 관련 추가**

`lucide-react` import에 `ImagePlus`가 없으면 추가하고, 파일 상단(다른 import 부근)에 drive 헬퍼 import를 추가한다:

```typescript
import { driveThumbUrl, driveViewUrl } from '@/lib/drive'
```
lucide import 목록(기존 `Link, ExternalLink, X, MessageSquare, Loader2 ...`)에 `ImagePlus` 추가.

> 주의: `lib/drive.ts`는 서버 I/O 함수도 export하지만, 클라이언트에서 import하는 건 순수 함수(`driveThumbUrl`/`driveViewUrl`)뿐이다. 이 둘은 `googleapis`를 참조하지 않으므로 번들에 문제 없다. 만약 빌드에서 `googleapis` 클라이언트 번들 경고가 나면 순수 헬퍼를 `lib/driveUrl.ts`로 분리하고 양쪽에서 re-export한다.

- [ ] **Step 2: 상태 추가 (596-597행 `logs`/`logsLoaded` 부근)**

```typescript
  const [photos, setPhotos] = useState<File[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 3: 파일 선택 핸들러 추가 (`addLog` 위에)**

```typescript
  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    setPhotos(prev => [...prev, ...picked].slice(0, 5))
    if (photoInputRef.current) photoInputRef.current.value = ''
  }
  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))
```

- [ ] **Step 4: `addLog` 수정 — 사진 업로드 후 attachments 동봉 (619-628행 교체)**

```typescript
  const addLog = async () => {
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      let attachments: { fileId: string; name: string }[] = []
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(p => fd.append('files', p))
        const up = await fetch('/api/tasks/logs/upload', { method: 'POST', body: fd })
        if (!up.ok) { alert((await up.json()).error ?? '사진 업로드 실패'); setSubmitting(false); return }
        attachments = (await up.json()).attachments
      }
      const prefix = logType === '이슈' ? '[이슈] ' : logType === '해결' ? '[해결] ' : ''
      const content = prefix + comment.trim()
      await fetch('/api/tasks/logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content, author: logAuthor.trim() || undefined, attachments }),
      })
      setComment('')
      setPhotos([])
      await refreshLogs()
    } finally {
      setSubmitting(false)
    }
  }
```

- [ ] **Step 5: 입력부 JSX — 사진 버튼 + 미리보기 추가**

진행사항 추가 영역에서 링크 버튼(847-849행, `<Link size={14} />` 버튼) 바로 뒤에 사진 버튼을 추가한다:

```tsx
              <button className="btn btn-ghost" onClick={() => photoInputRef.current?.click()} title="사진 첨부" style={{ padding: '8px 10px' }}>
                <ImagePlus size={14} />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: 'none' }} />
```

그리고 같은 입력 줄을 감싸는 컨테이너(801행 `<div style={{ display: 'flex', gap: 8, ... }}>`) 바로 아래에, 선택된 사진 미리보기를 추가한다:

```tsx
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={URL.createObjectURL(p)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button onClick={() => removePhoto(i)} title="제거"
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--critical)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 6: 타입 체크 + 개발 서버 컴파일**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add components/TasksClient.tsx
git commit -m "feat: 진행사항 입력부 사진 첨부·미리보기"
```

---

### Task 8: UI — 로그 항목에 사진 썸네일 렌더

**Files:**
- Modify: `components/TasksClient.tsx` (로그 렌더, 787행 본문 아래)

- [ ] **Step 1: 본문 아래 썸네일 그리드 추가**

로그 본문을 렌더하는 부분(782-788행의 `isLink ? <a> : <div>` 블록) 바로 다음, 같은 `<div style={{ flex: 1 }}>` 안쪽 끝에 추가한다:

```tsx
                        {Array.isArray(l.attachments) && l.attachments.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {l.attachments.map((a: { fileId: string; name: string }) => (
                              <a key={a.fileId} href={driveViewUrl(a.fileId)} target="_blank" rel="noopener noreferrer">
                                <img src={driveThumbUrl(a.fileId, 400)} alt={a.name}
                                  style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                              </a>
                            ))}
                          </div>
                        )}
```

> 이 렌더는 `embed` 여부와 무관하게 동작한다(공개 Drive URL이라 비로그인 임베드에서도 보임). 업로드·삭제 버튼만 기존 `!embed` 가드로 숨겨져 있다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add components/TasksClient.tsx
git commit -m "feat: 진행사항 로그에 사진 썸네일 렌더"
```

---

### Task 9: 통합 검증 + 문서 + 배포

**Files:**
- Modify: `CLAUDE.md` (task_logs 스키마, 환경변수 섹션)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: 성공. `googleapis`로 인한 클라이언트 번들 에러가 나면 Task 7 Step 1의 분리 가이드(`lib/driveUrl.ts`)를 적용.

- [ ] **Step 2: 단위 테스트 전체**

Run: `npx vitest run`
Expected: PASS (drive·slack 모두).

- [ ] **Step 3: 로컬 실동작 검증 (선행 작업 환경변수 필요)**

`.env.local`에 `GOOGLE_SERVICE_ACCOUNT_JSON`·`DRIVE_VOC_FOLDER_ID`가 있는 상태에서 `npm run dev` 후:
1. 수행과제 펼치기 → 진행사항 추가에서 사진 버튼으로 1~2장 선택 → 미리보기·× 제거 확인.
2. 내용 입력 후 "추가" → 로그에 텍스트+썸네일 표시, 썸네일 클릭 시 Drive 원본 새 탭.
3. Drive 전용 폴더에 파일이 올라갔는지 확인.
4. 로그 ×(삭제) → 행 사라지고, 잠시 후 Drive 파일도 사라지는지 확인.

Expected: 위 4가지 모두 정상.

- [ ] **Step 4: CLAUDE.md 문서 갱신**

`task_logs` 스키마 블록에 `attachments JSONB -- Drive fileId 배열 [{fileId,name}], 최대 5` 행을 추가하고, 환경변수 섹션에 `GOOGLE_SERVICE_ACCOUNT_JSON`·`DRIVE_VOC_FOLDER_ID` 두 줄을 추가한다.

- [ ] **Step 5: 커밋 + 배포**

```bash
git add CLAUDE.md
git commit -m "docs: task_logs attachments·Drive 환경변수 문서화"
git push origin main
```

Expected: Vercel 자동 배포. **배포 환경에도 두 환경변수가 등록되어 있어야** 운영에서 업로드가 동작한다.

---

## Self-Review 메모

- **스펙 커버리지**: 저장(Task 1·3) / 인증·서비스계정(Task 3) / 글에 동봉(Task 5·7) / 최대 5장(Task 2 검증·5 slice·7 slice) / 공개 권한(Task 3 permissions) / 임베드 표시(Task 8 주석) / 삭제 정리(Task 6) / 선행 작업(상단) — 모두 매핑됨.
- **타입 일관성**: `Attachment = {fileId, name}`를 `lib/drive.ts`에서 정의하고 upload API·delete·UI에서 동일 사용.
- **로그는 캐시 태그 불필요**: 진행사항은 `unstable_cache`가 아닌 클라이언트 직접 Supabase 조회(`loadLogs`)라 `revalidateTag` 대상 아님(기존 로그 POST에도 없음).
- **플레이스홀더 없음**: 모든 코드 스텝에 실제 코드 포함.
