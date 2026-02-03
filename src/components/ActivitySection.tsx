'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchActivity, type ActivityFilters } from '@/api/activity'
import { resolveAddresses } from '@/lib/ens'
import type { AuditLogEntry } from '@/types'

interface ActivitySectionProps {
  category?: string // Filter by category name
  name?: string // Filter by ENS name
  limit?: number // Max entries to show (default 10)
}

type GroupedEntry = {
  main: AuditLogEntry
  subEvents: AuditLogEntry[]
}

export default function ActivitySection({ category, name, limit = 10 }: ActivitySectionProps) {
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())

  const filters: ActivityFilters = {
    hideSystem: true, // Always exclude worker updates
    days: 365, // Last year
    ...(category && { category }),
    ...(name && { name }),
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity-section', category, name],
    queryFn: () => fetchActivity(1, limit, filters),
  })

  const rawEntries = data?.data?.entries || []

  // Group entries by timestamp + actor to identify triggered sub-events
  const entries: GroupedEntry[] = (() => {
    const grouped: GroupedEntry[] = []
    const processedIds = new Set<number>()

    for (const entry of rawEntries) {
      if (processedIds.has(entry.id)) continue

      const entryTime = new Date(entry.created_at).getTime()
      const related = rawEntries.filter((e) => {
        if (e.id === entry.id || processedIds.has(e.id)) return false
        const eTime = new Date(e.created_at).getTime()
        return Math.abs(eTime - entryTime) < 1000 && e.actor_address === entry.actor_address
      })

      if (entry.table_name === 'club_memberships') {
        const [clubName] = entry.record_key.split(':')
        const subEvents = related.filter(
          (e) => e.table_name === 'clubs' && e.operation === 'UPDATE' && e.record_key === clubName
        )
        const matchedSubEvent = subEvents.length > 0 ? [subEvents[0]] : []
        matchedSubEvent.forEach((e) => processedIds.add(e.id))
        grouped.push({ main: entry, subEvents: matchedSubEvent })
      } else if (entry.table_name === 'clubs' && entry.operation === 'UPDATE') {
        const meaningfulChanges = entry.new_data
          ? Object.keys(entry.new_data).filter((key) => {
              if (['created_at', 'updated_at', 'added_at', 'member_count', 'last_sales_update'].includes(key))
                return false
              return JSON.stringify(entry.old_data?.[key]) !== JSON.stringify(entry.new_data?.[key])
            })
          : []
        if (meaningfulChanges.length > 0) {
          grouped.push({ main: entry, subEvents: [] })
        }
      } else {
        grouped.push({ main: entry, subEvents: [] })
      }

      processedIds.add(entry.id)
    }
    return grouped
  })()

  // Resolve actor addresses to ENS names
  useEffect(() => {
    const addresses = rawEntries
      .map((e) => e.actor_address)
      .filter((a): a is string => a !== null)

    if (addresses.length > 0) {
      resolveAddresses(addresses).then(setEnsNames)
    }
  }, [rawEntries])

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffMonth = Math.floor(diffDay / 30)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
    return `${diffMonth}mo ago`
  }

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatActor = (address: string | null) => {
    if (!address) return <span className='text-neutral italic'>System</span>

    const ensName = ensNames.get(address.toLowerCase())
    if (ensName) {
      return (
        <span className='group relative'>
          {ensName}
          <span className='bg-secondary border-border absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block z-10'>
            {address}
          </span>
        </span>
      )
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const hiddenFields = ['created_at', 'updated_at', 'added_at', 'member_count', 'club_name', 'ens_name', 'name', 'last_sales_update']

  const getChangedFields = (entry: AuditLogEntry): { field: string; from: string; to: string }[] => {
    if (entry.table_name === 'club_memberships') return []
    if (!entry.old_data || !entry.new_data) return []

    const changes: { field: string; from: string; to: string }[] = []
    for (const key of Object.keys(entry.new_data)) {
      if (hiddenFields.includes(key)) continue
      const oldVal = entry.old_data[key]
      const newVal = entry.new_data[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const formatVal = (v: unknown) => {
          if (v === null || v === undefined) return '(empty)'
          if (typeof v === 'string' && v.length > 50) return v.slice(0, 50) + '...'
          return String(v)
        }
        changes.push({ field: key, from: formatVal(oldVal), to: formatVal(newVal) })
      }
    }
    return changes
  }

  const getActionText = (entry: AuditLogEntry) => {
    if (entry.table_name === 'clubs') {
      switch (entry.operation) {
        case 'INSERT':
          return 'Created category'
        case 'UPDATE': {
          const changes = getChangedFields(entry)
          if (changes.length > 0) {
            return (
              <>
                Updated {changes.map((c) => c.field).join(', ')}
              </>
            )
          }
          return 'Updated category'
        }
        case 'DELETE':
          return 'Deleted category'
      }
    } else {
      // club_memberships - record_key is "club_name:ens_name"
      const [clubName, ensName] = entry.record_key.split(':')
      switch (entry.operation) {
        case 'INSERT':
          // If we're on a category page, show the name; if on a name page, show the category
          if (category) {
            return (
              <>
                Added{' '}
                <Link href={`/names/${ensName}`} className='text-primary hover:underline'>
                  {ensName}
                </Link>
              </>
            )
          } else {
            return (
              <>
                Added to{' '}
                <Link href={`/categories/${clubName}`} className='text-primary hover:underline'>
                  {clubName}
                </Link>
              </>
            )
          }
        case 'DELETE':
          if (category) {
            return (
              <>
                Removed{' '}
                <Link href={`/names/${ensName}`} className='text-primary hover:underline'>
                  {ensName}
                </Link>
              </>
            )
          } else {
            return (
              <>
                Removed from{' '}
                <Link href={`/categories/${clubName}`} className='text-primary hover:underline'>
                  {clubName}
                </Link>
              </>
            )
          }
      }
    }
    return entry.operation
  }

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'INSERT':
        return (
          <div className='bg-success/20 text-success flex h-6 w-6 items-center justify-center rounded-full'>
            <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
            </svg>
          </div>
        )
      case 'UPDATE':
        return (
          <div className='bg-warning/20 text-warning flex h-6 w-6 items-center justify-center rounded-full'>
            <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
              />
            </svg>
          </div>
        )
      case 'DELETE':
        return (
          <div className='bg-error/20 text-error flex h-6 w-6 items-center justify-center rounded-full'>
            <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M20 12H4' />
            </svg>
          </div>
        )
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-8'>
        <div className='border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent' />
      </div>
    )
  }

  if (error) {
    return (
      <div className='text-neutral py-4 text-center text-sm'>
        Failed to load activity
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className='text-neutral py-4 text-center text-sm'>
        No recent activity
      </div>
    )
  }

  const toggleExpand = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div>
      <div className='space-y-3'>
        {entries.map(({ main: entry, subEvents }) => {
          const hasSubEvents = subEvents.length > 0
          const isExpanded = expandedEntries.has(entry.id)

          return (
            <div 
              key={entry.id} 
              className={`flex items-start gap-3 ${hasSubEvents ? 'cursor-pointer' : ''}`}
              onClick={hasSubEvents ? () => toggleExpand(entry.id) : undefined}
            >
              <div className='flex-shrink-0 pt-0.5'>
                {hasSubEvents && (
                  <svg
                    className={`h-3 w-3 text-neutral transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                  </svg>
                )}
                {!hasSubEvents && <div className='w-3' />}
              </div>
              {getOperationIcon(entry.operation)}
              <div className='min-w-0 flex-1'>
                <div className='text-sm'>
                  {getActionText(entry)}
                  {hasSubEvents && !isExpanded && (
                    <span className='text-neutral text-xs ml-1'>(+{subEvents.length})</span>
                  )}
                </div>
                {/* Show change details for category updates */}
                {entry.table_name === 'clubs' && entry.operation === 'UPDATE' && (() => {
                  const changes = getChangedFields(entry)
                  if (changes.length > 0) {
                    return (
                      <div className='text-xs text-neutral mt-0.5'>
                        {changes.map((change, idx) => (
                          <span key={idx}>
                            <span className='text-error line-through'>{change.from}</span>
                            {' → '}
                            <span className='text-success'>{change.to}</span>
                          </span>
                        ))}
                      </div>
                    )
                  }
                  return null
                })()}
                <div className='text-neutral text-xs flex items-center gap-1 mt-0.5'>
                  {formatActor(entry.actor_address)} •{' '}
                  <span className='group relative'>
                    {formatRelativeTime(entry.created_at)}
                    <span className='bg-secondary border-border absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block z-10'>
                      {formatFullDate(entry.created_at)}
                    </span>
                  </span>
                </div>
                {/* Sub-events when expanded */}
                {isExpanded && subEvents.length > 0 && (
                  <div className='mt-2 pl-2 border-l-2 border-tertiary space-y-1'>
                    {subEvents.map((sub) => {
                      const oldCount = sub.old_data?.member_count as number | undefined
                      const newCount = sub.new_data?.member_count as number | undefined
                      return (
                        <div key={sub.id} className='text-xs text-neutral'>
                          Updated count: {String(oldCount)} → {String(newCount)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className='text-neutral mt-4 text-center text-xs'>
        Admin actions from the last year (automated tasks excluded)
      </p>
    </div>
  )
}

