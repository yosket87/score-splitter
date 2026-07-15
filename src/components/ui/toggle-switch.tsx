'use client'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
  name?: string
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  name,
}: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between py-3 px-3.5 rounded-[12px] bg-muted">
      {name && <input type="hidden" name={name} value={String(checked)} />}
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-sub-text mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="ml-3 flex size-11 shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden="true"
          className="relative block h-[26px] w-11 rounded-full transition-colors"
          style={{
            background: checked ? 'var(--accent)' : 'var(--input)',
          }}
        >
          <span
            className="absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left]"
            style={{ left: checked ? 20 : 2 }}
          />
        </span>
      </button>
    </div>
  )
}
