import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pool = getPool()
    
    // Run DB queries and grails API call in parallel
    const [
      categoriesResult,
      recentCategoriesResult,
      namesInCategoriesResult,
      recentCategoriesCountResult,
      grailsMarketResponse,
    ] = await Promise.all([
      // Total categories
      pool.query('SELECT COUNT(*) as count FROM clubs'),
      
      // 5 most recently created categories (by created_at)
      pool.query(`
        SELECT name, description, member_count, created_at 
        FROM clubs 
        ORDER BY created_at DESC 
        LIMIT 5
      `),
      
      // Total names in categories (sum of member_count)
      pool.query('SELECT COALESCE(SUM(member_count), 0) as count FROM clubs'),
      
      // Categories created in last 30 days
      pool.query(`
        SELECT COUNT(*) as count 
        FROM clubs 
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      
      // Get total names from grails API
      fetch(`${GRAILS_API_URL}/analytics/market?period=all`).then(r => r.json()).catch(() => null),
    ])

    const totalCategories = parseInt(categoriesResult.rows[0]?.count || '0')
    const recentCategories = recentCategoriesResult.rows
    const namesInCategories = parseInt(namesInCategoriesResult.rows[0]?.count || '0')
    const categoriesLast30d = parseInt(recentCategoriesCountResult.rows[0]?.count || '0')
    
    // Get total names from grails API response (structure: data.overview.total_names)
    const totalNames = grailsMarketResponse?.data?.overview?.total_names || 0
    
    console.log('[Stats] DB results:', {
      totalCategories,
      namesInCategories,
      categoriesLast30d,
      recentCategoriesCount: recentCategories.length,
    })
    console.log('[Stats] Grails API response:', JSON.stringify(grailsMarketResponse, null, 2))

    const percentInCategories = totalNames > 0 
      ? ((namesInCategories / totalNames) * 100).toFixed(2)
      : '0'

    return NextResponse.json({
      success: true,
      data: {
        totalCategories,
        categoriesLast30d,
        namesInCategories,
        totalNames,
        percentInCategories,
        recentCategories,
      }
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

