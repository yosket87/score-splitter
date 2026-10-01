'use client'

import { useEffect, useState, type CSSProperties } from 'react'

/** キーボードによる表示領域の縮小・移動を固定配置のドロワーに反映する。 */
export function useDrawerViewport(active: boolean): CSSProperties | undefined {
  const [viewport, setViewport] = useState<{ height: number; bottom: number }>()

  useEffect(() => {
    const visualViewport = window.visualViewport
    if (!active || !visualViewport) return

    const update = () => {
      setViewport({
        height: visualViewport.height,
        bottom: visualViewport.height + visualViewport.offsetTop,
      })
    }
    update()
    visualViewport.addEventListener('resize', update)
    visualViewport.addEventListener('scroll', update)
    return () => {
      visualViewport.removeEventListener('resize', update)
      visualViewport.removeEventListener('scroll', update)
    }
  }, [active])

  if (!active || !viewport) return undefined
  return {
    maxHeight: `min(80dvh, ${viewport.height}px)`,
    // innerHeightはSafariの表示領域の移動でも変わるため、CSSの配置基準と同じdvhを使う。
    bottom: `calc(100dvh - ${viewport.bottom}px)`,
  }
}
