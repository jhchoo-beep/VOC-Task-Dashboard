import { describe, it, expect } from 'vitest'
import { driveThumbUrl, driveViewUrl, validateUploads, MAX_FILES, MAX_BYTES } from './driveUrl'

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
