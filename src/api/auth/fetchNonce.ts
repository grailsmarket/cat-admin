import { Address } from 'viem'

export const fetchNonce = async (address: Address): Promise<string> => {
  const response = await fetch(`/api/auth/nonce?address=${address}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()
  return data.data?.nonce || data.nonce
}

