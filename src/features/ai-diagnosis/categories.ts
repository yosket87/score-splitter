export const AI_CATEGORIES = [
  'groceries',
  'dining',
  'household',
  'housing',
  'utilities',
  'communications',
  'transportation',
  'healthcare',
  'clothing_beauty',
  'entertainment',
  'subscriptions',
  'social_gifts',
  'travel',
  'other',
] as const

export type AiCategory = (typeof AI_CATEGORIES)[number]

export const AI_CATEGORY_SET: ReadonlySet<string> = new Set(AI_CATEGORIES)
