import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CopyMode } from '@/types'

interface CopyModeSelectProps {
  mode: CopyMode
  onModeChange: (mode: CopyMode) => void
}

export function CopyModeSelect({ mode, onModeChange }: CopyModeSelectProps) {
  const descriptionId = useId()

  return (
    <div>
      <p className="mb-2 font-medium">既存データの処理</p>
      <Select value={mode} onValueChange={(value) => onModeChange(value as CopyMode)}>
        <SelectTrigger
          className="min-h-11"
          aria-label="既存データの処理"
          aria-describedby={mode === 'skip' ? descriptionId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="add">追加（既存データを残す）</SelectItem>
          <SelectItem value="skip">スキップ（同じ項目があればスキップ）</SelectItem>
          <SelectItem value="replace">置換（既存データを削除してコピー）</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'skip' && (
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          収入・支出はそれぞれ、コピー先の項目名と担当者が同じなら金額が違ってもスキップします。
          コピー先にない収入・支出は、同名・同担当者でも選んだ分をすべてコピーします。
          繰越は金額も同じ場合にスキップします。
        </p>
      )}
    </div>
  )
}
