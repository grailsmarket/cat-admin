export interface ChatModUser {
  id: number
  address: string
  persona_id: number | null
  email: string | null
  created_at: string
}

export interface ChatModStatus {
  user_id: number
  status: 'active' | 'banned'
  banned_at: string | null
  last_action_by: number | null
  last_action_reason: string | null
}

export interface ChatModMessage {
  id: string
  chat_id: string
  body: string
  created_at: string
  deleted_at: string | null
}

export interface ChatModLogEntry {
  id: number
  action: 'ban' | 'unban' | 'delete_messages'
  reason: string | null
  metadata: unknown
  created_at: string
  admin_id: number | null
}

export interface ChatModInfo {
  user: ChatModUser
  status: ChatModStatus
  messageStats: { total: number; visible: number; deleted: number }
  messages: ChatModMessage[]
  log: ChatModLogEntry[]
}

export interface ChatModInfoResponse {
  success: boolean
  data?: ChatModInfo
  error?: { code: string; message: string }
}

export interface ChatModActionResponse {
  success: boolean
  data?: unknown
  error?: { code: string; message: string }
}

export interface ChatLookupResponse {
  success: boolean
  data?: { user: { id: number; address: string } }
  error?: { code: string; message: string }
}

export async function lookupChatUser(query: string): Promise<ChatLookupResponse> {
  const response = await fetch(
    `/api/chat-moderation/users/lookup?q=${encodeURIComponent(query)}`,
    { credentials: 'include' }
  )
  return response.json()
}

export async function getChatModInfo(userId: number): Promise<ChatModInfoResponse> {
  const response = await fetch(`/api/chat-moderation/users/${userId}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function banUserFromChat(
  userId: number,
  reason: string
): Promise<ChatModActionResponse> {
  const response = await fetch(`/api/chat-moderation/users/${userId}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export async function unbanUserFromChat(
  userId: number,
  reason: string
): Promise<ChatModActionResponse> {
  const response = await fetch(`/api/chat-moderation/users/${userId}/unban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  })
  return response.json()
}

export async function deleteUserChatMessages(
  userId: number,
  reason: string
): Promise<ChatModActionResponse & {
  data?: { userId: number; deletedCount: number; affectedChatIds: string[]; messageIds: string[] }
}> {
  const response = await fetch(
    `/api/chat-moderation/users/${userId}/delete-messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason }),
    }
  )
  return response.json()
}
