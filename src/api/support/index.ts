export type SupportTicketStatus = 'open' | 'closed' | 'fixed'

export interface SupportTicket {
  id: number
  userId: number
  userAddress: string | null
  subject: string
  urls: string[]
  status: SupportTicketStatus
  createdAt: string
  updatedAt: string
  lastAdminReplyAt: string | null
  lastUserReplyAt: string | null
  messageCount?: number
}

export interface SupportTicketMessage {
  id: number
  ticketId: number
  authorUserId: number
  authorAddress: string | null
  authorRole: 'user' | 'admin'
  body: string
  createdAt: string
}

export interface SupportTicketsListResponse {
  success: boolean
  data?: {
    tickets: SupportTicket[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }
  error?: { code: string; message: string } | string
}

export interface SupportTicketDetailResponse {
  success: boolean
  data?: {
    ticket: SupportTicket
    messages: SupportTicketMessage[]
  }
  error?: { code: string; message: string } | string
}

export interface ListFilters {
  status?: SupportTicketStatus
  search?: string
  userId?: number
  page?: number
  limit?: number
}

export async function listSupportTickets(filters: ListFilters = {}): Promise<SupportTicketsListResponse> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.userId) params.set('userId', filters.userId.toString())
  if (filters.page) params.set('page', filters.page.toString())
  if (filters.limit) params.set('limit', filters.limit.toString())
  const qs = params.toString()
  const response = await fetch(`/api/support${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function getSupportTicket(id: number): Promise<SupportTicketDetailResponse> {
  const response = await fetch(`/api/support/${id}`, { credentials: 'include' })
  return response.json()
}

export async function postAdminReply(
  id: number,
  body: string
): Promise<{ success: boolean; data?: { messages: SupportTicketMessage[] }; error?: unknown }> {
  const response = await fetch(`/api/support/${id}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  return response.json()
}

export async function updateTicketStatus(
  id: number,
  status: SupportTicketStatus
): Promise<{ success: boolean; data?: { ticket: SupportTicket }; error?: unknown }> {
  const response = await fetch(`/api/support/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return response.json()
}
