type VerifyResponse = {
  success: boolean
  data?: {
    token: string
    address: string
    isAdmin: boolean
  }
  error?: string
}

export const verifySignature = async (message: string, signature: string): Promise<VerifyResponse> => {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, signature }),
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || 'Failed to verify signature',
    }
  }

  return data
}

