import type { Address } from 'viem'

export type Category = {
  name: string
  description: string | null
  member_count: number
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

