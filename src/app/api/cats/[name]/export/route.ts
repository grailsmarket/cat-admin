import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

type RouteParams = {
  params: Promise<{ name: string }>
}

// GET /api/cats/[name]/export - Export all names as CSV
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [club] = await query<{ name: string }>('SELECT name FROM clubs WHERE name = $1', [name])
    if (!club) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const names = await query<{ ens_name: string }>(
      'SELECT ens_name FROM club_memberships WHERE club_name = $1 ORDER BY ens_name ASC',
      [name]
    )

    const csv = names.map(n => n.ens_name).join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${name}-names.csv"`,
      },
    })
  } catch (error) {
    console.error('Export names error:', error)
    return NextResponse.json({ error: 'Failed to export names' }, { status: 500 })
  }
}
