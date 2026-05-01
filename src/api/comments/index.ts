export interface AdminComment {
  id: string
  ens_name_id: number
  user_id: number
  body: string
  body_censored: string | null
  status: 'visible' | 'deleted' | 'hidden'
  deleted_at: string | null
  deleted_by: number | null
  deleted_reason: string | null
  created_at: string
  updated_at: string
  ens_name: string
  author_address: string
  author_persona_id: number | null
  author_mod_status: 'active' | 'warned' | 'suspended' | 'banned' | null
  author_suspended_until: string | null
}

export interface ListCommentsResponse {
  success: boolean
  data?: { comments: AdminComment[]; nextCursor: string | null }
  error?: { code: string; message: string }
}

export interface CommentFilters {
  author?: string
  name?: string
  status?: 'visible' | 'deleted' | 'hidden' | 'all'
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export async function listComments(filters: CommentFilters): Promise<ListCommentsResponse> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v))
  }
  const response = await fetch(`/api/comments?${params.toString()}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function deleteComment(
  id: string,
  reason: string
): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/comments/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export interface UserModInfo {
  user: {
    id: number
    address: string
    persona_id: number | null
    email: string | null
    created_at: string
  }
  status: {
    user_id: number
    status: 'active' | 'warned' | 'suspended' | 'banned'
    suspended_until: string | null
    deletion_count_30d: number
  }
  comments: Array<{
    id: string
    body: string
    body_censored: string | null
    status: string
    created_at: string
    deleted_at: string | null
    deleted_reason: string | null
    ens_name: string
  }>
  log: Array<{
    id: number
    comment_id: string | null
    action: string
    reason: string | null
    metadata: unknown
    created_at: string
    admin_id: number | null
  }>
}

export interface UserModResponse {
  success: boolean
  data?: UserModInfo
  error?: { code: string; message: string }
}

export async function getUserModInfo(userId: number): Promise<UserModResponse> {
  const response = await fetch(`/api/comments/users/${userId}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function suspendUser(
  userId: number,
  days: number,
  reason: string
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/comments/users/${userId}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ days, reason }),
  })
  return response.json()
}

export async function banUser(
  userId: number,
  reason: string
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/comments/users/${userId}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export async function unbanUser(
  userId: number,
  reason: string
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/comments/users/${userId}/unban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export interface BlacklistTerm {
  id: number
  term: string
  action: 'censor' | 'block'
  created_at: string
  created_by: number | null
}

export interface BlacklistResponse {
  success: boolean
  data?: { terms: BlacklistTerm[] }
  error?: { code: string; message: string }
}

export async function listBlacklist(): Promise<BlacklistResponse> {
  const response = await fetch('/api/comments/blacklist', {
    credentials: 'include',
  })
  return response.json()
}

export async function addBlacklistTerm(
  term: string,
  action: 'censor' | 'block'
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const response = await fetch('/api/comments/blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ term, action }),
  })
  return response.json()
}

export async function removeBlacklistTerm(
  id: number
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/comments/blacklist/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return response.json()
}

export interface CommentConfig {
  warning_threshold: number
  suspension_threshold: number
  suspension_window_days: number
  default_suspension_days: number
  quota_cap: number
  quota_floor: number
  quota_names_weight: number
  quota_listings_weight: number
  quota_eth_weight: number
  max_comment_length: number
}

export interface ConfigResponse {
  success: boolean
  data?: { config: CommentConfig }
  error?: { code: string; message: string }
}

export async function getConfig(): Promise<ConfigResponse> {
  const response = await fetch('/api/comments/config', {
    credentials: 'include',
  })
  return response.json()
}

export async function updateConfig(
  patch: Partial<CommentConfig>
): Promise<ConfigResponse> {
  const response = await fetch('/api/comments/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return response.json()
}
