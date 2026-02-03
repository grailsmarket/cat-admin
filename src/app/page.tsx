'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '@/api/stats'
import { fetchActivitySummary, type ActivitySummary } from '@/api/activity'
import DashboardLayout from '@/components/DashboardLayout'
import ActivitySection from '@/components/ActivitySection'
import { resolveAddresses } from '@/lib/ens'

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DashboardPage() {
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['activity-summary'],
    queryFn: fetchActivitySummary,
  })

  const stats = statsData?.data

  // Resolve ENS names for actors
  useEffect(() => {
    if (summaryData && summaryData.length > 0) {
      const addresses = summaryData.map((s: ActivitySummary) => s.actor)
      resolveAddresses(addresses).then(setEnsNames)
    }
  }, [summaryData])

  const formatActor = (address: string): string => {
    const ensName = ensNames.get(address.toLowerCase())
    if (ensName) return ensName
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <DashboardLayout>
      <div className='p-8'>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold'>Dashboard</h1>
          <p className='text-neutral mt-1'>Overview of category management</p>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-8'>
          {/* Total Categories */}
          <div className='card'>
            <div className='flex items-start justify-between'>
              <div>
                <p className='text-neutral text-sm font-medium'>Total Categories</p>
                {statsLoading ? (
                  <div className='h-9 w-20 bg-tertiary animate-pulse rounded mt-1' />
                ) : statsError ? (
                  <p className='text-error text-sm'>Error loading</p>
                ) : (
                  <p className='text-4xl font-bold mt-1'>
                    {stats?.totalCategories.toLocaleString()}
                    {(stats?.categoriesLast30d ?? 0) > 0 && (
                      <span className='text-success text-base font-normal ml-2'>
                        +{stats?.categoriesLast30d} in last 30d
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className='bg-primary/10 rounded-lg p-3'>
                <svg className='h-6 w-6 text-primary' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Names in Categories */}
          <div className='card'>
            <div className='flex items-start justify-between'>
              <div>
                <p className='text-neutral text-sm font-medium'>Names in Categories</p>
                {statsLoading ? (
                  <div className='h-9 w-24 bg-tertiary animate-pulse rounded mt-1' />
                ) : statsError ? (
                  <p className='text-error text-sm'>Error loading</p>
                ) : (
                  <p className='text-4xl font-bold mt-1'>
                    {stats?.namesInCategories.toLocaleString()}
                    <span className='text-neutral text-base font-normal ml-2'>
                      ({stats?.percentInCategories}% of {stats?.totalNames.toLocaleString()})
                    </span>
                  </p>
                )}
              </div>
              <div className='bg-success/10 rounded-lg p-3'>
                <svg className='h-6 w-6 text-success' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z'
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Recently Created Categories */}
          <div className='card'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-semibold'>Recently Created</h2>
              <Link href='/categories' className='text-primary text-sm hover:underline'>
                View all →
              </Link>
            </div>
            {statsLoading ? (
              <div className='space-y-3'>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className='h-12 bg-tertiary animate-pulse rounded' />
                ))}
              </div>
            ) : stats?.recentCategories && stats.recentCategories.length > 0 ? (
              <div className='space-y-3'>
                {stats.recentCategories.map((cat) => (
                  <Link
                    key={cat.name}
                    href={`/categories/${cat.name}`}
                    className='flex items-center justify-between p-3 rounded-lg bg-tertiary hover:bg-tertiary/80 transition-colors'
                  >
                    <div className='min-w-0 flex-1'>
                      <p className='font-medium truncate'>{cat.name}</p>
                      <p className='text-neutral text-sm'>
                        {cat.member_count ?? 0} names
                      </p>
                    </div>
                    <span className='text-neutral text-xs ml-2 group relative cursor-default'>
                      {formatRelativeTime(cat.created_at)}
                      <span className='bg-secondary border-border absolute bottom-full right-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block z-10'>
                        {formatFullDate(cat.created_at)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className='text-neutral text-sm'>No categories yet</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className='card'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-semibold'>Recent Activity</h2>
              <Link href='/activity' className='text-primary text-sm hover:underline'>
                View all →
              </Link>
            </div>
            <ActivitySection displayLimit={7} />
          </div>
        </div>

        {/* Activity Summary - Last 7 Days */}
        <div className='card mt-6'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-lg font-semibold'>Admin Activity Summary</h2>
            <span className='text-neutral text-sm'>Last 7 days</span>
          </div>
          {summaryLoading ? (
            <div className='space-y-3'>
              {[1, 2].map(i => (
                <div key={i} className='h-16 bg-tertiary animate-pulse rounded' />
              ))}
            </div>
          ) : summaryData && summaryData.length > 0 ? (
            <div className='space-y-4'>
              {summaryData.map((actor: ActivitySummary) => {
                const actionLines: { icon: 'add' | 'remove' | 'create' | 'update'; text: string }[] = []
                
                if (actor.added > 0) {
                  const addCats = Object.entries(actor.categoryBreakdown)
                    .filter(([, v]) => v.added > 0)
                    .sort((a, b) => b[1].added - a[1].added)
                  
                  if (addCats.length === 1) {
                    actionLines.push({ icon: 'add', text: `Added ${actor.added} name${actor.added > 1 ? 's' : ''} to ${addCats[0][0]}` })
                  } else if (addCats.length > 1) {
                    actionLines.push({ icon: 'add', text: `Added ${actor.added} name${actor.added > 1 ? 's' : ''} across ${addCats.length} categories` })
                  }
                }
                
                if (actor.removed > 0) {
                  const removeCats = Object.entries(actor.categoryBreakdown)
                    .filter(([, v]) => v.removed > 0)
                    .sort((a, b) => b[1].removed - a[1].removed)
                  
                  if (removeCats.length === 1) {
                    actionLines.push({ icon: 'remove', text: `Removed ${actor.removed} name${actor.removed > 1 ? 's' : ''} from ${removeCats[0][0]}` })
                  } else if (removeCats.length > 1) {
                    actionLines.push({ icon: 'remove', text: `Removed ${actor.removed} name${actor.removed > 1 ? 's' : ''} from ${removeCats.length} categories` })
                  }
                }
                
                if (actor.created > 0) {
                  actionLines.push({ icon: 'create', text: `Created ${actor.created} categor${actor.created > 1 ? 'ies' : 'y'}` })
                }
                
                if (actor.updated > 0) {
                  actionLines.push({ icon: 'update', text: `Updated ${actor.updated} categor${actor.updated > 1 ? 'ies' : 'y'}` })
                }

                if (actionLines.length === 0) return null

                return (
                  <div key={actor.actor} className='p-4 rounded-lg bg-tertiary'>
                    <p className='font-medium text-primary mb-2'>{formatActor(actor.actor)}</p>
                    <ul className='space-y-1.5'>
                      {actionLines.map((action, idx) => (
                        <li key={idx} className='flex items-center gap-2 text-sm'>
                          {action.icon === 'add' && (
                            <div className='bg-success/20 text-success flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0'>
                              <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
                              </svg>
                            </div>
                          )}
                          {action.icon === 'remove' && (
                            <div className='bg-error/20 text-error flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0'>
                              <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M20 12H4' />
                              </svg>
                            </div>
                          )}
                          {action.icon === 'create' && (
                            <div className='bg-primary/20 text-primary flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0'>
                              <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
                              </svg>
                            </div>
                          )}
                          {action.icon === 'update' && (
                            <div className='bg-warning/20 text-warning flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0'>
                              <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                              </svg>
                            </div>
                          )}
                          <span>{action.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className='text-neutral text-sm'>No admin activity in the last 7 days</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
