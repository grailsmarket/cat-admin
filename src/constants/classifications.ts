/**
 * Valid category classifications (meta-categories)
 * 
 * These are predefined groupings for categories.
 * A category can belong to multiple classifications.
 */
export const VALID_CLASSIFICATIONS = [
  'ethmojis',
  'digits',
  'palindromes',
  'prepunk',
  'geo',
  'letters',
  'fantasy',
  'crypto',
] as const

export type Classification = typeof VALID_CLASSIFICATIONS[number]

/**
 * Human-readable labels for classifications
 */
export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  ethmojis: 'Ethmojis',
  digits: 'Digits',
  palindromes: 'Palindromes',
  prepunk: 'Pre-Punk',
  geo: 'Geographic',
  letters: 'Letters',
  fantasy: 'Fantasy',
  crypto: 'Crypto',
}

/**
 * Check if a value is a valid classification
 */
export function isValidClassification(value: string): value is Classification {
  return VALID_CLASSIFICATIONS.includes(value as Classification)
}

/**
 * Filter and validate an array of classifications
 */
export function validateClassifications(values: string[]): Classification[] {
  return values.filter(isValidClassification)
}
