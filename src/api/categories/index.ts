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

// Create category response with potential details
export type CreateCategoryResponse = ApiResponse<Category> & {
  details?: {
    required?: string[]
    checkUrl?: string
  }
}

// Create category
export async function createCategory(
  name: string,
  description?: string,
  classifications?: string[]
): Promise<CreateCategoryResponse> {
  const response = await fetch('/api/cats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, description, classifications }),
  })
  return response.json()
}

// Update category options
export interface UpdateCategoryOptions {
  description?: string
  classifications?: string[]
}

// Update category
export async function updateCategory(
  name: string,
  options: UpdateCategoryOptions
): Promise<ApiResponse<Category>> {
  const response = await fetch(`/api/cats/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(options),
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

// Invalid name scan result
export interface InvalidNameEntry {
  name: string
  reason: string
  added_at: string
}

export interface InvalidNamesScanResult {
  success: boolean
  category: string
  totalScanned: number
  invalidCount: number
  invalidNames: InvalidNameEntry[]
  error?: string
}

// Scan a category for invalid ENS names
export async function scanInvalidNames(categoryName: string): Promise<InvalidNamesScanResult> {
  const response = await fetch(`/api/cats/${encodeURIComponent(categoryName)}/invalid-names`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to scan for invalid names')
  }

  return response.json()
}

