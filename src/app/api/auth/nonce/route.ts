import { NextRequest, NextResponse } from 'next/server'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

// Proxy to grails-backend for nonce
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 })
    }

    const response = await fetch(`${GRAILS_API_URL}/auth/nonce?address=${address}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: data.error || 'Failed to get nonce' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Nonce error:', error)
    return NextResponse.json({ error: 'Failed to get nonce' }, { status: 500 })
  }
}

