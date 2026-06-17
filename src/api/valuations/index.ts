export interface ValuationSettings {
  enabled: boolean
  window_days: number
  quota_admin: number | null // null = unlimited
  quota_avatar: number | null // null = unlimited
  quota_name: number
  quota_default: number
  evidence_cache_days: number
  valuation_days: number
  updated_at?: string
}

export interface ValuationSettingsResponse {
  success: boolean
  data?: { config: ValuationSettings }
  error?: { code: string; message: string }
}

export async function getValuationSettings(): Promise<ValuationSettingsResponse> {
  const response = await fetch('/api/valuations/config', {
    credentials: 'include',
  })
  return response.json()
}

export async function updateValuationSettings(
  patch: Partial<ValuationSettings>
): Promise<ValuationSettingsResponse> {
  const response = await fetch('/api/valuations/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return response.json()
}
