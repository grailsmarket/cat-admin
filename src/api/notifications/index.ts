import type { TierId } from '@/lib/tiers'

export type Channel = 'in_app' | 'email' | 'telegram'

export type { TierId }

export type AudienceFilter =
  | { type: 'everyone' }
  | { type: 'specific'; addresses: string[] }
  | { type: 'unsubscribed' }
  | { type: 'tiers'; tierIds: TierId[] }

export interface PreviewRequest {
  channels: Channel[]
  audience: AudienceFilter
}

export interface PreviewResponse {
  success: boolean
  data?: {
    totalRecipients: number
    byChannel: { in_app: number; email: number; telegram: number }
  }
  error?: string
}

export interface ComposePayload {
  title: string
  body: string
  linkUrl?: string
  imageUrl?: string
  channels: Channel[]
}

export type BroadcastPayload = ComposePayload & { audience: AudienceFilter }

export interface SendResponse {
  success: boolean
  data?: { broadcastId: number; enqueued?: number }
  error?: string
}

export interface ImageUploadResponse {
  success: boolean
  data?: { key: string; url: string }
  error?: string
}

export interface BroadcastHistoryRow {
  id: number
  title: string
  body: string
  link_url: string | null
  image_url: string | null
  channels: string[]
  recipient_count: number
  is_test: boolean
  created_at: string
  sent_by_address: string | null
}

export interface ListBroadcastsResponse {
  success: boolean
  data?: {
    broadcasts: BroadcastHistoryRow[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }
  error?: string
}

export async function previewNotification(payload: PreviewRequest): Promise<PreviewResponse> {
  const response = await fetch('/api/notifications/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return response.json()
}

export async function sendTestNotification(payload: ComposePayload): Promise<SendResponse> {
  const response = await fetch('/api/notifications/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return response.json()
}

export async function sendBroadcast(payload: BroadcastPayload): Promise<SendResponse> {
  const response = await fetch('/api/notifications/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return response.json()
}

export async function listBroadcasts(
  page = 1,
  limit = 25
): Promise<ListBroadcastsResponse> {
  const response = await fetch(`/api/notifications?page=${page}&limit=${limit}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function uploadNotificationImage(file: File): Promise<ImageUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/notifications/images', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return response.json()
}
