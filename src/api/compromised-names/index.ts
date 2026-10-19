export type CompromisedStatus = 'active' | 'resolved'

export interface CompromiseIncident {
  slug: string
  title: string
  description: string | null
  info_url: string | null
  malicious_operators: string[]
}

// Row from GET /compromised-names/admin (compromised_names.* plus joined fields)
export interface CompromisedName {
  id: number
  incident_id: number
  incident_slug: string
  ens_name_id: number | null
  name: string
  token_id: string | null
  original_owner: string
  allowed_addresses: string[]
  taken_by: string | null
  taken_tx_hash: string | null
  taken_block: string | null
  taken_at: string | null
  status: CompromisedStatus
  resolved_at: string | null
  resolved_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  current_owner: string | null
  active_listings: string | number // COUNT(*) comes back as a bigint string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

// Backend errors are { error: { code, message } }; our proxy errors are { error: string }
type ApiError = string | { code?: string; message?: string }

interface ApiResponse<T> {
  success?: boolean
  data?: T
  error?: ApiError
}

export function getErrorMessage(error: ApiError | undefined, fallback: string): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || fallback
}

export interface CompromisedFilters {
  status?: CompromisedStatus
  incident?: string
  q?: string
  page?: number
  limit?: number
}

export async function listCompromisedNames(
  filters: CompromisedFilters
): Promise<ApiResponse<{ names: CompromisedName[]; pagination: Pagination }>> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v))
  }
  const response = await fetch(`/api/compromised-names?${params.toString()}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function listIncidents(): Promise<ApiResponse<{ incidents: CompromiseIncident[] }>> {
  const response = await fetch('/api/compromised-names/incidents', {
    credentials: 'include',
  })
  return response.json()
}

export interface CreateCompromisedInput {
  incident: string
  name: string
  originalOwner: string
  allowedAddresses: string[]
  takenBy?: string
  takenTxHash?: string
  takenAt?: string
  notes?: string
}

export async function createCompromisedName(
  input: CreateCompromisedInput
): Promise<ApiResponse<CompromisedName>> {
  const response = await fetch('/api/compromised-names', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return response.json()
}

export interface UpdateCompromisedInput {
  allowedAddresses?: string[]
  originalOwner?: string
  status?: CompromisedStatus
  resolvedReason?: string
  notes?: string | null
}

export async function updateCompromisedName(
  id: number,
  input: UpdateCompromisedInput
): Promise<ApiResponse<CompromisedName>> {
  const response = await fetch(`/api/compromised-names/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return response.json()
}

// Validation mirroring the backend zod schemas
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
export const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/
export const MAX_ALLOWED_ADDRESSES = 20
export const MAX_NOTES_LENGTH = 2000
export const MAX_RESOLVED_REASON_LENGTH = 64

// Parse a textarea of addresses (newline / comma / space separated), lowercased and de-duped
export function parseAddressList(input: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>()
  const invalid: string[] = []
  for (const token of input.split(/[\s,]+/).filter(Boolean)) {
    if (ADDRESS_RE.test(token)) valid.add(token.toLowerCase())
    else invalid.push(token)
  }
  return { valid: [...valid], invalid }
}
