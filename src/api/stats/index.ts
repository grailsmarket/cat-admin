export type DashboardStats = {
  totalCategories: number
  categoriesLast30d: number
  namesInCategories: number
  totalNames: number
  percentInCategories: string
  recentCategories: {
    name: string
    description: string | null
    member_count: number
    created_at: string
  }[]
}

export async function fetchDashboardStats(): Promise<{ success: boolean; data?: DashboardStats; error?: string }> {
  try {
    const response = await fetch('/api/stats', {
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch stats' }
    }
    
    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch stats' 
    }
  }
}

