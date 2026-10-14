'use client'

import { useRef, useState } from 'react'

export function useEntryEditor<T extends { id: string }>(entries: T[]) {
  const [selection, setSelection] = useState<{ id: string | null; open: boolean; generation: number }>({
    id: null, open: false, generation: 0,
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const generationRef = useRef(0)
  const entry = entries.find((item) => item.id === selection.id)

  function openEditor(id: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    generationRef.current += 1
    setSelection({ id, open: true, generation: generationRef.current })
  }

  return {
    entry,
    openEditor,
    modalProps: {
      open: selection.open,
      trigger: null,
      onOpenChange: (open: boolean) => {
        // 終了アニメーション中も選択項目と本文を保持する。
        // 古い保存応答で、別の項目や再オープン後の編集を閉じない。
        setSelection((current) => current.generation === selection.generation ? { ...current, open } : current)
      },
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault()
        if (generationRef.current === selection.generation && triggerRef.current?.isConnected) {
          triggerRef.current.focus()
        }
      },
    },
  }
}
