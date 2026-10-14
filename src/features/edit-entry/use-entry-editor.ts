'use client'

import { useRef, useState } from 'react'

export function useEntryEditor<T extends { id: string }>(entries: T[]) {
  const [selection, setSelection] = useState<{ id: string | null; open: boolean }>({ id: null, open: false })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const entry = entries.find((item) => item.id === selection.id)

  function openEditor(id: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setSelection({ id, open: true })
  }

  return {
    entry,
    openEditor,
    modalProps: {
      open: selection.open,
      trigger: null,
      onOpenChange: (open: boolean) => {
        // 終了アニメーション中も選択項目と本文を保持する。
        setSelection((current) => ({ ...current, open }))
      },
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault()
        if (triggerRef.current?.isConnected) triggerRef.current.focus()
      },
    },
  }
}
