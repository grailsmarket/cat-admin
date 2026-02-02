import type { Category, CategoryMember, ApiResponse } from '@/types'

export type CategoryWithNames = Category & {
  names: CategoryMember[]
  pagination: {
    page: number
    limit: number
    totalNames: number
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

// Get single category with names
export async function fetchCategory(
  name: string,
  page = 1,
  limit = 50
): Promise<ApiResponse<CategoryWithNames>> {
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

// Add names to category
export type AddNamesResponse = {
  success: boolean
  message?: string
  added?: number
  skipped?: number
  error?: string
  invalidNames?: string[]
}

export async function addNames(
  categoryName: string,
  names: string[]
): Promise<AddNamesResponse> {
  const response = await fetch(`/api/cats/${categoryName}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ names }),
  })
  return response.json()
}

// Remove names from category
export type RemoveNamesResponse = {
  success: boolean
  message?: string
  removed?: number
  error?: string
}

export async function removeNames(
  categoryName: string,
  names: string[]
): Promise<RemoveNamesResponse> {
  const response = await fetch(`/api/cats/${categoryName}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ names }),
  })
  return response.json()
}

