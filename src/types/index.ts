import type { Address } from 'viem'

export type Category = {
  name: string
  description: string | null
  name_count: number
  classifications: string[]
  created_at: string
  updated_at: string
}

export type CategoryMember = {
  ens_name: string
  added_at: string
}

export type AuthUser = {
  address: Address
  isAdmin: boolean
}

export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}

export type AuditLogEntry = {
  id: number
  table_name: 'clubs' | 'club_memberships'
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  record_key: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  actor_address: string | null
  db_user: string
  created_at: string
}

