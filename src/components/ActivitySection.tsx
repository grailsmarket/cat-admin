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

export default function ActivitySection({ category, name, limit = 10 }: ActivitySectionProps) {
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const filters: ActivityFilters = {
    hideSystem: true, // Always exclude worker updates
    days: 30, // Last 30 days only
    ...(category && { category }),
    ...(name && { name }),
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity-section', category, name],
    queryFn: () => fetchActivity(1, limit, filters),
  })

  const entries = data?.data?.entries || []

  // Resolve actor addresses to ENS names
  useEffect(() => {
    const addresses = entries
      .map((e) => e.actor_address)
      .filter((a): a is string => a !== null)

    if (addresses.length > 0) {
      resolveAddresses(addresses).then(setEnsNames)
    }
  }, [entries])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatActor = (address: string | null) => {
    if (!address) return <span className='text-neutral italic'>System</span>

    const ensName = ensNames.get(address.toLowerCase())
    if (ensName) {
      return <span title={address}>{ensName}</span>
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getActionText = (entry: AuditLogEntry) => {
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

  return (
    <div>
      <div className='space-y-3'>
        {entries.map((entry) => (
          <div key={entry.id} className='flex items-start gap-3'>
            {getOperationIcon(entry.operation)}
            <div className='min-w-0 flex-1'>
              <div className='text-sm'>{getActionText(entry)}</div>
              <div className='text-neutral text-xs'>
                {formatActor(entry.actor_address)} • {formatDate(entry.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className='text-neutral mt-4 text-center text-xs'>
        Showing admin actions from the last 30 days (excludes automated updates)
      </p>
    </div>
  )
}

