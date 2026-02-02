import type { Category, CategoryMember, ApiResponse } from '@/types'

export type CategoryWithMembers = Category & {
  members: CategoryMember[]
  pagination: {
    page: number
    limit: number
    totalMembers: number
    totalPages: number
  }
}

// List all categories
export async function fetchCategories(): Promise<ApiResponse<Category[]>> {
  const response = await fetch('/api/cats', {
    credentials: 'include',
  })
  return response.json()
}

// Get single category with members
export async function fetchCategory(
  name: string,
  page = 1,
  limit = 50
): Promise<ApiResponse<CategoryWithMembers>> {
  const response = await fetch(`/api/cats/${name}?page=${page}&limit=${limit}`, {
    credentials: 'include',
  })
  return response.json()
}

// Create category
export async function createCategory(
  name: string,
  description?: string
): Promise<ApiResponse<Category>> {
  const response = await fetch('/api/cats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, description }),
  })
  return response.json()
}

// Update category
export async function updateCategory(
  name: string,
  description: string
): Promise<ApiResponse<Category>> {
  const response = await fetch(`/api/cats/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ description }),
  })
  return response.json()
}

// Add members to category
export type AddMembersResponse = {
  success: boolean
  message?: string
  added?: number
  skipped?: number
  error?: string
  invalidNames?: string[]
}

export async function addMembers(
  categoryName: string,
  names: string[]
): Promise<AddMembersResponse> {
  const response = await fetch(`/api/cats/${categoryName}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ names }),
  })
  return response.json()
}

// Remove members from category
export type RemoveMembersResponse = {
  success: boolean
  message?: string
  removed?: number
  error?: string
}

export async function removeMembers(
  categoryName: string,
  names: string[]
): Promise<RemoveMembersResponse> {
  const response = await fetch(`/api/cats/${categoryName}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ names }),
  })
  return response.json()
}

