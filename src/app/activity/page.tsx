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

  const entries = data?.data?.entries || []
  const pagination = data?.data?.pagination

  // Resolve actor addresses to ENS names
  useEffect(() => {
    const addresses = entries
      .map(e => e.actor_address)
      .filter((a): a is string => a !== null)
    
    if (addresses.length > 0) {
      resolveAddresses(addresses).then(setEnsNames)
    }
  }, [entries])

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

  const getChangedFields = (entry: AuditLogEntry): { field: string; from: string; to: string }[] => {
    if (entry.operation === 'INSERT') {
      // Show new values
      if (!entry.new_data) return []
      return Object.entries(entry.new_data)
        .filter(([key]) => !['created_at', 'updated_at'].includes(key))
        .map(([key, value]) => ({
          field: key,
          from: '—',
          to: String(value ?? ''),
        }))
    } else if (entry.operation === 'DELETE') {
      // Show deleted values
      if (!entry.old_data) return []
      return Object.entries(entry.old_data)
        .filter(([key]) => !['created_at', 'updated_at'].includes(key))
        .map(([key, value]) => ({
          field: key,
          from: String(value ?? ''),
          to: '—',
        }))
    } else {
      // UPDATE - show differences
      if (!entry.old_data || !entry.new_data) return []
      const changes: { field: string; from: string; to: string }[] = []
      for (const key of Object.keys(entry.new_data)) {
        if (['created_at', 'updated_at'].includes(key)) continue
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
                      <th>Time</th>
                      <th>Type</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const changes = getChangedFields(entry)
                      return (
                        <tr key={entry.id}>
                          <td className='text-neutral whitespace-nowrap text-sm align-top'>
                            {formatDate(entry.created_at)}
                          </td>
                          <td className='align-top'>
                            <div className='flex items-center gap-2'>
                              {getTableBadge(entry.table_name)}
                              {getOperationBadge(entry.operation)}
                            </div>
                          </td>
                          <td className='text-sm'>
                            <div className='font-medium'>{getChangeDescription(entry)}</div>
                            {changes.length > 0 && (
                              <div className='mt-1 space-y-1 text-xs'>
                                {changes.map((change, idx) => (
                                  <div key={idx} className='flex items-center gap-1'>
                                    <span className='text-neutral'>{change.field}:</span>
                                    {entry.operation === 'UPDATE' ? (
                                      <>
                                        <span className='text-error line-through'>{change.from}</span>
                                        <span className='text-neutral'>→</span>
                                        <span className='text-success'>{change.to}</span>
                                      </>
                                    ) : entry.operation === 'INSERT' ? (
                                      <span className='text-success'>{change.to}</span>
                                    ) : (
                                      <span className='text-error line-through'>{change.from}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className='text-sm align-top'>{formatRecordKey(entry)}</td>
                        <td className='text-sm align-top'>
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

