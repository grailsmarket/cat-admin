'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchActivity, fetchActors, type ActivityFilters } from '@/api/activity'
import { resolveAddresses } from '@/lib/ens'
import SearchableSelect from '@/components/SearchableSelect'
import type { AuditLogEntry } from '@/types'

export default function ActivityPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ActivityFilters>({})
  const [showSystemUpdates, setShowSystemUpdates] = useState(false)
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())
  const [actorEnsNames, setActorEnsNames] = useState<Map<string, string | null>>(new Map())
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())

  // Fetch unique actors for the dropdown
  const { data: actorsData } = useQuery({
    queryKey: ['activity-actors'],
    queryFn: fetchActors,
    staleTime: 60000, // Cache for 1 minute
  })

  const actors = actorsData || []

  // Resolve actor addresses to ENS names for the dropdown
  useEffect(() => {
    if (actors.length > 0) {
      resolveAddresses(actors).then(setActorEnsNames)
    }
  }, [actors])

  // Build actor options for the dropdown
  const actorOptions = actors.map((address) => {
    const ensName = actorEnsNames.get(address.toLowerCase())
    return {
      value: address,
      label: ensName 
        ? `${ensName} (${address.slice(0, 6)}...${address.slice(-4)})`
        : `${address.slice(0, 6)}...${address.slice(-4)}`,
      searchTerms: [address.toLowerCase(), ensName?.toLowerCase() || ''].filter(Boolean),
    }
  })

  // Include hideSystem in the query - filter server-side for correct pagination
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['activity', page, filters, showSystemUpdates],
    queryFn: () => fetchActivity(page, 50, { ...filters, hideSystem: !showSystemUpdates }),
    placeholderData: keepPreviousData,
  })

  const rawEntries = data?.data?.entries || []
  const pagination = data?.data?.pagination

  // Group entries by timestamp + actor to identify triggered sub-events
  type GroupedEntry = {
    main: AuditLogEntry
    subEvents: AuditLogEntry[]
  }

  const groupedEntries: GroupedEntry[] = []
  const processedIds = new Set<number>()

  for (const entry of rawEntries) {
    if (processedIds.has(entry.id)) continue

    // Find related entries (same second, same actor)
    const entryTime = new Date(entry.created_at).getTime()
    const related = rawEntries.filter((e) => {
      if (e.id === entry.id || processedIds.has(e.id)) return false
      const eTime = new Date(e.created_at).getTime()
      // Within 1 second and same actor
      return Math.abs(eTime - entryTime) < 1000 && e.actor_address === entry.actor_address
    })

    // Determine main vs sub events
    // Membership actions are main, category updates are sub
    if (entry.table_name === 'club_memberships') {
      // This is a main event - find triggered update for THIS specific club only
      const [clubName] = entry.record_key.split(':')
      const subEvents = related.filter((e) => 
        e.table_name === 'clubs' && e.operation === 'UPDATE' && e.record_key === clubName
      )
      // Only take the first matching sub-event (one membership change = one count update)
      const matchedSubEvent = subEvents.length > 0 ? [subEvents[0]] : []
      matchedSubEvent.forEach((e) => processedIds.add(e.id))
      groupedEntries.push({ main: entry, subEvents: matchedSubEvent })
    } else if (entry.table_name === 'clubs' && entry.operation === 'UPDATE') {
      // Check if only member_count/last_sales_update changed - if so, skip standalone
      const meaningfulChanges = entry.new_data ? Object.keys(entry.new_data).filter((key) => {
        if (['created_at', 'updated_at', 'member_count', 'last_sales_update'].includes(key)) return false
        return JSON.stringify(entry.old_data?.[key]) !== JSON.stringify(entry.new_data?.[key])
      }) : []
      
      // Only show if meaningful changes OR it's a standalone update
      if (meaningfulChanges.length > 0) {
        groupedEntries.push({ main: entry, subEvents: [] })
      }
      // Otherwise skip - it's noise without a parent event
    } else {
      // Other entries (like category INSERT/DELETE)
      groupedEntries.push({ main: entry, subEvents: [] })
    }

    processedIds.add(entry.id)
  }

  const entries = groupedEntries

  // Resolve actor addresses to ENS names
  useEffect(() => {
    const addresses = rawEntries
      .map(e => e.actor_address)
      .filter((a): a is string => a !== null)
    
    if (addresses.length > 0) {
      resolveAddresses(addresses).then(setEnsNames)
    }
  }, [rawEntries])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatActor = (address: string | null) => {
    if (!address) return <span className='text-neutral italic'>System</span>
    
    const ensName = ensNames.get(address.toLowerCase())
    if (ensName) {
      return (
        <span title={address}>
          {ensName}
        </span>
      )
    }
    
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getOperationBadge = (operation: string) => {
    const styles: Record<string, string> = {
      INSERT: 'bg-success/20 text-success',
      UPDATE: 'bg-warning/20 text-warning',
      DELETE: 'bg-error/20 text-error',
    }
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[operation] || 'bg-tertiary'}`}>
        {operation}
      </span>
    )
  }

  const getTableBadge = (tableName: string) => {
    const label = tableName === 'clubs' ? 'Category' : 'Membership'
    return (
      <span className='bg-tertiary rounded-full px-2 py-0.5 text-xs'>
        {label}
      </span>
    )
  }

  const formatRecordKey = (entry: AuditLogEntry) => {
    if (entry.table_name === 'clubs') {
      // record_key is the club name
      return (
        <Link href={`/categories/${entry.record_key}`} className='text-primary hover:underline'>
          {entry.record_key}
        </Link>
      )
    } else {
      // record_key is "club_name:ens_name"
      const [clubName, ensName] = entry.record_key.split(':')
      return (
        <span>
          <Link href={`/names/${ensName}`} className='text-primary hover:underline'>
            {ensName}
          </Link>
          <span className='text-neutral'> in </span>
          <Link href={`/categories/${clubName}`} className='text-primary hover:underline'>
            {clubName}
          </Link>
        </span>
      )
    }
  }

  const getChangeDescription = (entry: AuditLogEntry) => {
    if (entry.table_name === 'clubs') {
      switch (entry.operation) {
        case 'INSERT':
          return 'Created category'
        case 'UPDATE':
          return 'Updated category'
        case 'DELETE':
          return 'Deleted category'
      }
    } else {
      switch (entry.operation) {
        case 'INSERT':
          return 'Added name to category'
        case 'DELETE':
          return 'Removed name from category'
      }
    }
    return entry.operation
  }

  // Fields to hide from change display (noisy/redundant)
  const hiddenFields = ['created_at', 'updated_at', 'added_at', 'member_count', 'club_name', 'ens_name', 'name']

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getChangedFields = (entry: AuditLogEntry): { field: string; from: string; to: string }[] => {
    // For membership changes, don't show field details - the record_key tells the story
    if (entry.table_name === 'club_memberships') {
      return []
    }

    if (entry.operation === 'INSERT') {
      // For new categories, only show description if set
      if (!entry.new_data) return []
      return Object.entries(entry.new_data)
        .filter(([key]) => !hiddenFields.includes(key))
        .filter(([, value]) => value !== null && value !== '')
        .map(([key, value]) => ({
          field: key,
          from: '—',
          to: String(value ?? ''),
        }))
    } else if (entry.operation === 'DELETE') {
      // Don't show details for deletes
      return []
    } else {
      // UPDATE - show only meaningful differences
      if (!entry.old_data || !entry.new_data) return []
      const changes: { field: string; from: string; to: string }[] = []
      for (const key of Object.keys(entry.new_data)) {
        if (hiddenFields.includes(key)) continue
        const oldVal = entry.old_data[key]
        const newVal = entry.new_data[key]
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push({
            field: key,
            from: String(oldVal ?? ''),
            to: String(newVal ?? ''),
          })
        }
      }
      return changes
    }
  }

  return (
    <div className='p-8'>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Activity Log</h1>
        <p className='text-neutral mt-1'>Track all changes to categories and memberships</p>
      </div>

      {/* Filters */}
      <div className='mb-6 flex flex-wrap items-center gap-4'>
        <div>
          <label className='text-neutral mb-1 block text-xs'>Table</label>
          <select
            value={filters.table || ''}
            onChange={(e) => {
              setFilters({ ...filters, table: e.target.value as ActivityFilters['table'] || undefined })
              setPage(1)
            }}
            className='text-sm'
          >
            <option value=''>All tables</option>
            <option value='clubs'>Categories</option>
            <option value='club_memberships'>Memberships</option>
          </select>
        </div>
        <div>
          <label className='text-neutral mb-1 block text-xs'>Operation</label>
          <select
            value={filters.operation || ''}
            onChange={(e) => {
              setFilters({ ...filters, operation: e.target.value as ActivityFilters['operation'] || undefined })
              setPage(1)
            }}
            className='text-sm'
          >
            <option value=''>All operations</option>
            <option value='INSERT'>Insert</option>
            <option value='UPDATE'>Update</option>
            <option value='DELETE'>Delete</option>
          </select>
        </div>
        <div className='w-64'>
          <label className='text-neutral mb-1 block text-xs'>Actor</label>
          <SearchableSelect
            options={actorOptions}
            value={filters.actor || ''}
            onChange={(value) => {
              setFilters({ ...filters, actor: value || undefined })
              setPage(1)
            }}
            placeholder='All actors...'
          />
        </div>
        {(filters.table || filters.operation || filters.actor) && (
          <div className='self-end'>
            <button
              onClick={() => {
                setFilters({})
                setPage(1)
              }}
              className='btn btn-secondary text-sm'
            >
              Clear Filters
            </button>
          </div>
        )}
        
        {/* Spacer */}
        <div className='flex-1'></div>
        
        {/* Show worker updates toggle */}
        <div className='flex items-center gap-2 self-end'>
          <span className='text-sm text-neutral'>Show worker updates</span>
          <label className='relative inline-flex cursor-pointer items-center'>
            <input
              type='checkbox'
              checked={showSystemUpdates}
              onChange={(e) => {
                setShowSystemUpdates(e.target.checked)
                setPage(1) // Reset to page 1 when toggling
              }}
              className='peer sr-only'
            />
            <div className="peer h-5 w-9 rounded-full bg-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full"></div>
          </label>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className='bg-error/10 border-error mb-6 rounded-lg border p-4'>
          <p className='text-error'>{(error as Error).message}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className='flex items-center justify-center py-12'>
          <div className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && entries.length === 0 && (
        <div className='card py-12 text-center'>
          <svg
            className='text-neutral mx-auto mb-4 h-12 w-12'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
            />
          </svg>
          <h3 className='mb-2 text-lg font-semibold'>No activity yet</h3>
          <p className='text-neutral'>Activity will appear here when changes are made.</p>
        </div>
      )}

      {/* Activity table */}
      {!isLoading && !error && entries.length > 0 && (
        <>
          <div className='relative'>
            {/* Loading overlay */}
            {isFetching && (
              <div
                className='absolute inset-0 z-10 flex items-center justify-center rounded-lg'
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              >
                <div className='border-primary h-10 w-10 animate-spin rounded-full border-4 border-t-transparent' />
              </div>
            )}
            <div className='card overflow-hidden p-0'>
              <div className='max-h-[70vh] overflow-y-auto'>
                <table>
                  <thead className='bg-secondary sticky top-0'>
                    <tr>
                      <th className='w-24'>Time</th>
                      <th>Action</th>
                      <th>Changes</th>
                      <th className='w-40'>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(({ main: entry, subEvents }) => {
                      const changes = getChangedFields(entry)
                      const hasSubEvents = subEvents.length > 0
                      const isExpanded = expandedEntries.has(entry.id)

                      const toggleExpand = () => {
                        setExpandedEntries((prev) => {
                          const next = new Set(prev)
                          if (next.has(entry.id)) {
                            next.delete(entry.id)
                          } else {
                            next.add(entry.id)
                          }
                          return next
                        })
                      }

                      return (
                        <tr 
                          key={entry.id} 
                          className={hasSubEvents ? 'cursor-pointer hover:bg-secondary/50' : ''}
                          onClick={hasSubEvents ? toggleExpand : undefined}
                        >
                          <td className='text-neutral whitespace-nowrap text-sm'>
                            <span className='group relative cursor-default'>
                              {formatRelativeTime(entry.created_at)}
                              <span className='bg-secondary border-border absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block z-10'>
                                {formatFullDate(entry.created_at)}
                              </span>
                            </span>
                          </td>
                          <td className='text-sm'>
                            <div className='flex items-center gap-2'>
                              {/* Always reserve space for chevron to keep alignment */}
                              <div className='w-4 flex-shrink-0'>
                                {hasSubEvents && (
                                  <svg 
                                    className={`h-4 w-4 text-neutral transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                    fill='none' 
                                    viewBox='0 0 24 24' 
                                    stroke='currentColor'
                                  >
                                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                                  </svg>
                                )}
                              </div>
                              {getOperationBadge(entry.operation)}
                              <span>
                                {entry.table_name === 'clubs' ? (
                                  <>
                                    {entry.operation === 'INSERT' && 'Created '}
                                    {entry.operation === 'UPDATE' && 'Updated '}
                                    {entry.operation === 'DELETE' && 'Deleted '}
                                    <Link 
                                      href={`/categories/${entry.record_key}`} 
                                      className='text-primary hover:underline font-medium'
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {entry.record_key}
                                    </Link>
                                  </>
                                ) : (
                                  <>
                                    {entry.operation === 'INSERT' && 'Added '}
                                    {entry.operation === 'DELETE' && 'Removed '}
                                    {(() => {
                                      const [clubName, ensName] = entry.record_key.split(':')
                                      return (
                                        <>
                                          <Link 
                                            href={`/names/${ensName}`} 
                                            className='text-primary hover:underline font-medium'
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {ensName}
                                          </Link>
                                          <span className='text-neutral'> {entry.operation === 'INSERT' ? 'to' : 'from'} </span>
                                          <Link 
                                            href={`/categories/${clubName}`} 
                                            className='text-primary hover:underline'
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {clubName}
                                          </Link>
                                        </>
                                      )
                                    })()}
                                  </>
                                )}
                              </span>
                              {hasSubEvents && !isExpanded && (
                                <span className='text-neutral text-xs'>
                                  (+{subEvents.length} triggered)
                                </span>
                              )}
                            </div>
                            {/* Sub-events when expanded */}
                            {isExpanded && subEvents.length > 0 && (
                              <div className='mt-2 pl-6 border-l-2 border-tertiary space-y-1'>
                                {subEvents.map((sub) => {
                                  const oldCount = sub.old_data?.member_count as number | undefined
                                  const newCount = sub.new_data?.member_count as number | undefined
                                  return (
                                    <div key={sub.id} className='text-xs text-neutral'>
                                      <span className='bg-tertiary rounded px-1.5 py-0.5 mr-2'>triggered</span>
                                      Updated{' '}
                                      <Link 
                                        href={`/categories/${sub.record_key}`} 
                                        className='text-primary hover:underline'
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {sub.record_key}
                                      </Link>
                                      {oldCount !== undefined && newCount !== undefined && (
                                        <span className='ml-1'>
                                          (count: {String(oldCount)} → {String(newCount)})
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                          <td className='text-sm text-neutral'>
                            {changes.length > 0 ? (
                              <div className='space-y-0.5'>
                                {changes.map((change, idx) => (
                                  <div key={idx} className='text-xs'>
                                    <span className='text-neutral/70'>{change.field}:</span>{' '}
                                    <span className='text-error line-through'>{change.from}</span>
                                    {' → '}
                                    <span className='text-success'>{change.to}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className='text-neutral/50'>—</span>
                            )}
                          </td>
                          <td className='text-sm'>
                            {formatActor(entry.actor_address)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className='mt-4 flex items-center justify-between'>
              <p className='text-neutral text-sm'>
                Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, pagination.totalEntries)} of{' '}
                {pagination.totalEntries.toLocaleString()}
              </p>
              <div className='flex gap-2'>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  className='btn btn-secondary text-sm disabled:opacity-50'
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages || isFetching}
                  className='btn btn-secondary text-sm disabled:opacity-50'
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

