import { ens_normalize } from '@adraffy/ens-normalize'

/**
 * Normalize ENS name per ENSIP-15 using the official library
 * 
 * Returns null if normalization fails (invalid ENS name)
 */
export function normalizeEnsName(name: string): string | null {
  if (!name) return null
  
  try {
    // Trim whitespace before normalizing
    const trimmed = name.trim()
    if (trimmed.length === 0) return null
    
    // Use official ENSIP-15 normalization
    return ens_normalize(trimmed)
  } catch {
    // Normalization failed - invalid ENS name
    return null
  }
}

/**
 * Safely normalize ENS name, returning original (lowercased) if normalization fails
 * Useful when you want a fallback rather than null
 */
export function safeNormalizeEnsName(name: string): string {
  const normalized = normalizeEnsName(name)
  return normalized ?? name.trim().toLowerCase()
}

/**
 * Parse and normalize a list of ENS names from textarea input
 * Returns { valid: string[], invalid: string[] }
 */
export function parseAndNormalizeNames(input: string): { 
  valid: string[]
  invalid: string[] 
} {
  const lines = input.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  const valid: string[] = []
  const invalid: string[] = []
  
  for (const line of lines) {
    const normalized = normalizeEnsName(line)
    if (normalized) {
      valid.push(normalized)
    } else {
      invalid.push(line)
    }
  }
  
  return { valid, invalid }
}
