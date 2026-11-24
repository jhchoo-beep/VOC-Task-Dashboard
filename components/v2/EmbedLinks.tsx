'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

// 노션 임베드(/embed/v2/*) 안에서 /v2/* 링크를 누르면 로그인 화면으로 튕기지 않게
// 같은 화면의 임베드 주소(/embed/v2/*?key=…)로 바꿔 연다. 화면 코드는 /v2 주소를 그대로 쓴다.
export function toEmbedHref(href: string, key: string) {
  if (!href.startsWith('/v2')) return null
  return `/embed${href}${href.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`
}

/** 임베드 화면이면 임베드 주소로, 아니면 그대로(코드에서 router.push 할 때) */
export function v2Href(href: string) {
  if (typeof window === 'undefined' || !window.location.pathname.startsWith('/embed/')) return href
  const key = new URLSearchParams(window.location.search).get('key') ?? ''
  return toEmbedHref(href, key) ?? href
}

export default function EmbedLinks() {
  const router = useRouter()
  const key = useSearchParams()?.get('key') ?? ''

  useEffect(() => {
    if (!key) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      const href = a?.getAttribute('href')
      const to = href ? toEmbedHref(href, key) : null
      if (!to) return
      e.preventDefault()
      e.stopPropagation()   // next/link 의 자체 이동보다 먼저 가로챈다
      router.push(to)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [key, router])

  return null
}
