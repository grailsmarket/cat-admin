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

export async function fetchCategories(): Promise<ApiResponse<Category[]>> {
  const response = await fetch('/api/cats', {
    credentials: 'include',
  })
  return response.json()
}

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

export type CreateCategoryResponse = ApiResponse<Category>

export async function createCategory(
  name: string,
  options: {
    display_name?: string
    description?: string
    classifications?: string[]
    avatar?: File
    header?: File
  }
): Promise<CreateCategoryResponse> {
  const formData = new FormData()
  formData.append('name', name)
  if (options.display_name) formData.append('display_name', options.display_name)
  if (options.description) formData.append('description', options.description)
  if (options.classifications?.length) {
    formData.append('classifications', JSON.stringify(options.classifications))
  }
  if (options.avatar) formData.append('avatar', options.avatar)
  if (options.header) formData.append('header', options.header)

  const response = await fetch('/api/cats', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return response.json()
}

export interface UpdateCategoryOptions {
  description?: string
  display_name?: string
  classifications?: string[]
}

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

export type ImageUploadResponse = ApiResponse<{
  avatar_url: string | null
  header_url: string | null
}>

export async function uploadCategoryImage(
  categoryName: string,
  type: 'avatar' | 'header',
  file: File
): Promise<ImageUploadResponse> {
  const formData = new FormData()
  formData.append('type', type)
  formData.append('file', file)

  const response = await fetch(`/api/cats/${categoryName}/images`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return response.json()
}

