# Design System — ヤマワケ（家計精算アプリ）

## Direction

**「デジタル精密さと暮らしの温もりの共存」**

夫婦がキッチンテーブルで帳簿を広げる — その行為をデジタルに昇華したインターフェース。冷たい精密さ（モノスペース数値、ネオングロー）と暮らしの温かみ（担当者カラー、やわらかい角丸）が同居する。

### Who
共働き夫婦。月末や給料日後に、スマホまたはPCから数分で収支を入力し精算結果を確認する。忙しい日常の合間に使うツール。

### What they accomplish
- 今月の収支を入力する
- 誰がいくら払うべきか（精算額）を即座に知る
- 夫婦間の負担バランスを視覚的に把握する

### Feel
帳簿のような信頼感。数字は正確にモノスペースで。でも冷たすぎない — 二人の暮らしを支えるツールとしての温かみがある。

---

## Foundation

- **Color temperature:** Cool navy base (oklch hue 260) with warm accents
- **Depth strategy:** Layered shadows (light mode) + Glow effects (dark mode)
- **Border approach:** Subtle rgba borders, low opacity (8-12% in dark mode)
- **Overall feel:** Precise yet approachable

---

## Tokens

### Spacing
- **Base unit:** 4px
- **Scale:** 4, 8, 12, 16, 24, 32, 48, 64
- **Component padding:** 16px standard, 12px compact
- **Section gap:** 24px (`space-y-6`)

### Border Radius
- **Base:** `--radius: 0.75rem` (12px)
- **Scale:** sm (8px), md (10px), lg (12px), xl (16px), 2xl (20px)
- **Personality:** Moderately rounded — technical enough for data, friendly enough for household use

### Typography
- **Sans:** Geist Sans — geometric, modern, readable
- **Mono:** Geist Mono — all currency/numeric values
- **Numeric:** `font-variant-numeric: tabular-nums` on all monetary displays
- **Hierarchy:**
  - Hero number: text-5xl/6xl, font-bold, font-mono
  - Section title: text-base, font-medium (CardTitle)
  - Body: text-sm
  - Metadata: text-xs, text-muted-foreground, tracking-widest uppercase

### Color System (oklch)

**Base hue:** 260 (blue-gray)

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--background` | 0.97 0.01 260 | 0.16 0.02 260 | Page canvas |
| `--card` | 1 0 0 (white) | 0.20 0.02 260 | Card surfaces |
| `--foreground` | 0.15 0.02 260 | 0.93 0.01 260 | Primary text |
| `--muted-foreground` | 0.45 0.02 260 | 0.60 0.02 260 | Secondary text |
| `--border` | 0.90 0.01 260 | white/8% | Default border |
| `--accent` | 0.55 0.18 195 | 0.72 0.16 195 | Primary accent (cyan/teal) |

**Domain colors:**

| Token | Purpose | Hue |
|-------|---------|-----|
| `--husband` | Husband identity | 250 (indigo) |
| `--wife` | Wife identity | 350 (coral/rose) |
| `--neon-green` | Income, positive | 155 |
| `--neon-red` | Expense, negative | 25 |
| `--neon-cyan` | Settlement amount, accent | 195 |

**Semantic:** green = income/positive, red = expense/negative, cyan = settlement/action, indigo = husband, rose = wife

---

## Depth

### Light Mode
- **Card shadow:** `0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)`
- **Card hover:** `0 4px 12px oklch(0 0 0 / 0.08), 0 2px 4px oklch(0 0 0 / 0.04)` + translateY(-1px)
- **Hero card:** gradient overlay + glow-lg

### Dark Mode
- **Glow (sm):** `0 0 8px accent/15%`
- **Glow (md):** `0 0 16px accent/20%`
- **Glow (lg):** `0 0 24px accent/25%`
- **Card hover:** accent glow + border-color shift

---

## Surfaces

### Header
- `glass-strong`: 75% card opacity + blur(20px) + saturate(1.2)
- Sticky, z-50, subtle bottom border

### Cards
- Standard: `shadow-card card-interactive`
- Hero (settlement): gradient overlay + `glow-lg` + `border-accent/30`

### Page Background
- Gradient: 135deg from base to teal-tinted (`gradient-page`)

---

## Patterns

### Hero Settlement Card
- Gradient background overlay (hero-from → hero-via → hero-to)
- Settlement amount: text-5xl/6xl, font-bold, text-neon-cyan, font-mono
- Direction label below: "夫 → 妻" or "妻 → 夫"
- Balance bar: husband(indigo) | wife(rose) proportional display
- Glow border: `border-accent/30 glow-lg`

### Data Card (Income/Expense/Carryover)
- CardHeader: title left, total right (colored mono)
- Item rows: PersonBadge + label + amount, hover bg-muted/30
- Empty state: centered icon circle + message
- Inline form at bottom for quick entry

### Summary Card (Monthly Results)
- 2-column grid: label left, value right
- Values in colored mono (green for income, red for expense)
- Border-top separator for totals
- Compact: text-sm throughout

### Person Badge
- `--husband` (indigo) / `--wife` (rose) with light background variants
- Small pill/badge format

### Interactive States
- Card hover: border-color shift to accent/30, shadow elevation, translateY(-1px)
- Row hover: bg-muted/30
- Transitions: 200ms ease

---

## Signature Element

**Balance Bar** — 二人の負担比率を一本の水平バーで視覚化。左がhusband(indigo)、右がwife(rose)。天秤のメタファーがUIに直接表れている。transition 500ms ease-outでアニメーション。

---

## Utilities

| Class | Purpose |
|-------|---------|
| `font-tabular` | tabular-nums for numeric alignment |
| `glow-sm/md/lg` | Glow effects (dark mode accent) |
| `glass` / `glass-strong` | Frosted glass surfaces |
| `gradient-page` | Page background gradient |
| `shadow-card` / `shadow-card-hover` | Card elevation |
| `card-interactive` | Hover: border + shadow + lift |
| `animate-fade-in` | Entry animation (300ms) |
