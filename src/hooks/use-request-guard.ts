'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

// 開始時の画面の寿命を捕捉する。認可は各Server Actionが判断する。
export function useRequestGuard() {
  const generation = useRef<object | null>(null)
  useLayoutEffect(() => {
    generation.current = {}
    return () => { generation.current = null }
  }, [])
  return useCallback(() => {
    const started = generation.current
    return () => started !== null && generation.current === started
  }, [])
}
