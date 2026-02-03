import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

// Fields that indicate a triggered/automated update (not manual admin action)
const TRIGGERED_FIELDS = ['member_count', 'last_sales_update', 'created_at', 'updated_at']

// GET /api/activity/summary - Get activity summary for the last 7 days grouped by actor
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all audit log entries from the last 7 days with actor
    type AuditRow = {
      id: number
      actor_address: string
      table_name: string
      operation: string
      record_key: string
      old_data: Record<string, unknown> | null
      new_data: Record<string, unknown> | null
    }

    const rows = await query<AuditRow>(
      `SELECT id, actor_address, table_name, operation, record_key, old_data, new_data
       FROM clubs_audit_log
       WHERE created_at >= NOW() - INTERVAL '7 days'
         AND actor_address IS NOT NULL
       ORDER BY actor_address, created_at DESC`
    )

    // Process and aggregate by actor
    const actorData: Record<string, {
      addedNames: Set<string>  // Unique "category:name" combinations added
      removedNames: Set<string>  // Unique "category:name" combinations removed
      created: number
      updatedCategories: Set<string>
      deleted: number
      categoryBreakdown: Record<string, { addedNames: Set<string>; removedNames: Set<string> }>
    }> = {}

    for (const row of rows) {
      const actor = row.actor_address.toLowerCase()
      
      if (!actorData[actor]) {
        actorData[actor] = {
          addedNames: new Set(),
          removedNames: new Set(),
          created: 0,
          updatedCategories: new Set(),
          deleted: 0,
          categoryBreakdown: {},
        }
      }

      if (row.table_name === 'club_memberships') {
        // record_key format: "club_name:ens_name"
        const [categoryName, ensName] = row.record_key.split(':')
        const uniqueKey = `${categoryName}:${ensName}`
        
        if (!actorData[actor].categoryBreakdown[categoryName]) {
          actorData[actor].categoryBreakdown[categoryName] = { addedNames: new Set(), removedNames: new Set() }
        }

        if (row.operation === 'INSERT') {
          actorData[actor].addedNames.add(uniqueKey)
          actorData[actor].categoryBreakdown[categoryName].addedNames.add(ensName)
        } else if (row.operation === 'DELETE') {
          actorData[actor].removedNames.add(uniqueKey)
          actorData[actor].categoryBreakdown[categoryName].removedNames.add(ensName)
        }
      } else if (row.table_name === 'clubs') {
        if (row.operation === 'INSERT') {
          actorData[actor].created++
        } else if (row.operation === 'DELETE') {
          actorData[actor].deleted++
        } else if (row.operation === 'UPDATE') {
          // Check if this is a meaningful update (not just triggered fields)
          if (row.old_data && row.new_data) {
            const changedFields = Object.keys(row.new_data).filter(key => {
              if (TRIGGERED_FIELDS.includes(key)) return false
              return JSON.stringify(row.old_data![key]) !== JSON.stringify(row.new_data![key])
            })
            
            // Only count if there are meaningful changes
            if (changedFields.length > 0) {
              actorData[actor].updatedCategories.add(row.record_key)
            }
          }
        }
      }
    }

    // Format response
    const summary = Object.entries(actorData).map(([actor, data]) => ({
      actor,
      added: data.addedNames.size,  // Unique names added
      removed: data.removedNames.size,  // Unique names removed
      created: data.created,
      updated: data.updatedCategories.size, // Count of unique categories updated
      deleted: data.deleted,
      categoryBreakdown: Object.fromEntries(
        Object.entries(data.categoryBreakdown).map(([cat, breakdown]) => [
          cat,
          { added: breakdown.addedNames.size, removed: breakdown.removedNames.size }
        ])
      ),
    }))

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error) {
    console.error('Error fetching activity summary:', error)
    return NextResponse.json({ error: 'Failed to fetch activity summary' }, { status: 500 })
  }
}
