'use client'

import { useLayoutEffect, useState, type CSSProperties } from 'react'

/** キーボードによる表示領域の縮小・移動を固定配置のドロワーに反映する。 */
export function useDrawerViewport(active: boolean): CSSProperties | undefined {
  const [viewport, setViewport] = useState<{ height: number; bottom: number }>()

  useLayoutEffect(() => {
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

  // 閉じる途中は最後の寸法を保持する。次回はlayout effectで描画前に読み直す。
  if (!viewport) return undefined
  return {
    maxHeight: `min(80vh, ${viewport.height}px)`,
    // innerHeightはSafariの表示領域の移動でも変わるため、CSSの配置基準と同じdvhを使う。
    bottom: `calc(100dvh - ${viewport.bottom}px)`,
  }
}
