/**
 * 스크립트용 Supabase 클라이언트 — .env.local 의 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY(앱과 같은 anon 키).
 * V2 스크립트는 SELECT 만 한다(새 표 RLS 는 anon·authenticated SELECT 정책만, 기존 표는 읽기만).
 */
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

export function supabaseFromEnvFile() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다')
  return createClient(url, key)
}
