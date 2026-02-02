type AuthCheckResponse = {
  success: boolean
  data?: {
    address: string
    isAdmin: boolean
  }
  error?: string
}

export const checkAuthentication = async (): Promise<AuthCheckResponse> => {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    })

    if (!response.ok) {
      return { success: false }
    }

    const data = await response.json()
    return data
  } catch {
    return { success: false }
  }
}

