export interface AdminGlobalMessage {
  id: string
  chat_id: string
  sender_user_id: number
  body: string
  created_at: string
  deleted_at: string | null
  sender_address: string
  sender_mod_status: 'active' | 'banned' | null
  sender_global_status: 'active' | 'banned' | null
}

export interface GlobalMessagesPagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ListGlobalMessagesResponse {
  success: boolean
  data?: { messages: AdminGlobalMessage[]; pagination: GlobalMessagesPagination }
  error?: { code: string; message: string }
}

export interface GlobalMessageFilters {
  sender?: string
  status?: 'all' | 'visible' | 'deleted'
  from?: string
  to?: string
  page?: number
  limit?: number
}

export async function listGlobalMessages(
  filters: GlobalMessageFilters
): Promise<ListGlobalMessagesResponse> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v))
  }
  const response = await fetch(`/api/global-chat/messages?${params.toString()}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function deleteGlobalMessage(
  id: string,
  reason: string
): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/global-chat/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export interface GlobalChatConfig {
  enabled: boolean
  quota_with_avatar: number | null
  quota_with_name: number
  quota_without_name: number
  max_message_length: number
  rate_limit_per_minute: number
}

export interface GlobalChatConfigResponse {
  success: boolean
  data?: { config: GlobalChatConfig }
  error?: { code: string; message: string }
}

export async function getGlobalChatConfig(): Promise<GlobalChatConfigResponse> {
  const response = await fetch('/api/global-chat/config', {
    credentials: 'include',
  })
  return response.json()
}

export async function updateGlobalChatConfig(
  patch: Partial<GlobalChatConfig>
): Promise<GlobalChatConfigResponse> {
  const response = await fetch('/api/global-chat/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return response.json()
}

/** Ban from GLOBAL CHAT only — DMs unaffected. All-chats ban is banUserFromChat (chat-moderation). */
export async function banUserFromGlobalChat(
  userId: number,
  reason: string
): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/global-chat/users/${userId}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

/** Lift a global-chat-only ban. Does not touch an all-chats ban. */
export async function unbanUserFromGlobalChat(
  userId: number,
  reason: string
): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
  const response = await fetch(`/api/global-chat/users/${userId}/unban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}
