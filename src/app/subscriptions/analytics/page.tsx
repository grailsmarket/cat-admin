'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchSubscriberAnalytics,
  fetchSubscriptionRevenue,
  type SubscriptionRevenueRow,
} from '@/api/subscriptions/analytics'
import { resolveAddresses } from '@/lib/ens'
import { ALL_TIER_LABELS } from '@/lib/tiers'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = toISODate(now)
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
  const days = daysMap[preset] ?? 30
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  return { from: toISODate(from), to }
}

const PRESETS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
]

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatEth(eth: number, fractionDigits = 4): string {
  if (!isFinite(eth)) return '—'
  return `${eth.toLocaleString('en-US', { maximumFractionDigits: fractionDigits })} ETH`
}

function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !isFinite(usd)) return '—'
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<Payload<number, string>>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className='rounded-lg border border-border bg-secondary p-3 shadow-lg'>
      <p className='mb-2 text-sm font-medium'>
        {new Date(label ?? '').toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </p>
      <div className='space-y-1'>
        {payload
          .filter((entry) => (entry.value ?? 0) > 0)
          .map((entry) => (
            <div key={String(entry.dataKey)} className='flex items-center gap-2 text-xs'>
              <span className='inline-block h-2 w-2 rounded-full' style={{ backgroundColor: entry.color }} />
              <span className='text-neutral'>{entry.name}:</span>
              <span className='font-medium'>{entry.value?.toLocaleString()}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<Payload<number, string>>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className='rounded-lg border border-border bg-secondary p-3 shadow-lg'>
      <p className='mb-2 text-sm font-medium'>
        {new Date(label ?? '').toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </p>
      <div className='space-y-1'>
        {payload.map((entry) => {
          const v = entry.value ?? 0
          if (!v) return null
          let formatted: string
          if (entry.dataKey === 'eth') formatted = formatEth(v)
          else if (entry.dataKey === 'usd') formatted = formatUsd(v)
          else formatted = v.toLocaleString()
          return (
            <div key={String(entry.dataKey)} className='flex items-center gap-2 text-xs'>
              <span className='inline-block h-2 w-2 rounded-full' style={{ backgroundColor: entry.color }} />
              <span className='text-neutral'>{entry.name}:</span>
              <span className='font-medium'>{formatted}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SubscriberAnalyticsPage() {
  const defaultRange = getPresetRange('30d')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState<string | null>('30d')
  const [activeTab, setActiveTab] = useState<'routes' | 'users'>('routes')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscriber-analytics', dateRange.from, dateRange.to],
    queryFn: () => fetchSubscriberAnalytics(dateRange.from, dateRange.to),
  })

  const { data: drilldownData } = useQuery({
    queryKey: ['subscriber-analytics-user', dateRange.from, dateRange.to, selectedUser],
    queryFn: () => fetchSubscriberAnalytics(dateRange.from, dateRange.to, selectedUser!),
    enabled: !!selectedUser,
  })

  const revenueQuery = useQuery({
    queryKey: ['subscription-revenue', dateRange.from, dateRange.to],
    queryFn: () => fetchSubscriptionRevenue(dateRange.from, dateRange.to),
  })
  const revenue = revenueQuery.data?.data
  const revenueSummary = revenue?.summary

  const analyticsData = data?.data
  const summary = analyticsData?.summary
  const userDrilldown = drilldownData?.data?.userDrilldown

  useEffect(() => {
    if (!analyticsData?.topUsers?.length) return
    const addresses = analyticsData.topUsers.map((u) => u.address)
    resolveAddresses(addresses).then(setEnsNames)
  }, [analyticsData?.topUsers])

  const handlePreset = (preset: string) => {
    setActivePreset(preset)
    setDateRange(getPresetRange(preset))
    setSelectedUser(null)
  }

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    setActivePreset(null)
    setDateRange((prev) => ({ ...prev, [field]: value }))
    setSelectedUser(null)
  }

  const handleSelectUser = (address: string) => {
    setSelectedUser(address)
    setActiveTab('users')
  }

  const chartData = analyticsData?.daily?.map((d) => {
    const userDay = userDrilldown?.daily?.find((ud) => ud.date === d.date)
    return {
      ...d,
      ...(userDrilldown ? { userTotal: userDay?.total ?? 0 } : {}),
    }
  })

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Subscriber Analytics</h1>
        <p className='text-neutral mt-1 text-sm'>
          API requests to tier-gated endpoints, filtered to users who held a Plus-or-above subscription at the time of the request.
        </p>
      </div>

      {/* Date Controls */}
      <div className='card mb-6'>
        <div className='mb-4 flex flex-wrap gap-2'>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={`btn text-sm ${activePreset === p.value ? 'btn-primary' : 'btn-secondary'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className='flex flex-wrap items-center gap-4'>
          <input
            type='date'
            value={dateRange.from}
            onChange={(e) => handleCustomDate('from', e.target.value)}
            className='rounded-lg border border-border bg-tertiary px-3 py-2 text-sm focus:border-primary focus:outline-none'
          />
          <span className='text-neutral text-sm'>to</span>
          <input
            type='date'
            value={dateRange.to}
            onChange={(e) => handleCustomDate('to', e.target.value)}
            className='rounded-lg border border-border bg-tertiary px-3 py-2 text-sm focus:border-primary focus:outline-none'
          />
        </div>
      </div>

      {/* Revenue section */}
      <div className='mb-8'>
        <h2 className='mb-3 text-xl font-semibold'>Subscription Revenue</h2>

        {revenueQuery.error || (revenueQuery.data && !revenueQuery.data.success) ? (
          <div className='mb-4 rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
            {revenueQuery.data?.error || 'Failed to load subscription revenue'}
          </div>
        ) : null}

        <div className='mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4'>
          <div className='card'>
            <p className='text-neutral text-sm font-medium'>Paid Subscriptions</p>
            {revenueQuery.isLoading ? (
              <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
            ) : (
              <p className='mt-1 text-3xl font-bold'>{(revenueSummary?.totalSubs ?? 0).toLocaleString()}</p>
            )}
            {revenueSummary && (
              <p className='text-neutral mt-1 text-xs'>
                {revenueSummary.uniqueUsers.toLocaleString()} unique user{revenueSummary.uniqueUsers === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className='card'>
            <p className='text-neutral text-sm font-medium'>ETH Earned</p>
            {revenueQuery.isLoading ? (
              <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
            ) : (
              <p className='mt-1 text-3xl font-bold'>
                {(revenueSummary?.totalEth ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </p>
            )}
            <p className='text-neutral mt-1 text-xs'>Excludes admin grants</p>
          </div>
          <div className='card'>
            <p className='text-neutral text-sm font-medium'>USD (at sub time)</p>
            {revenueQuery.isLoading ? (
              <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
            ) : (
              <p className='mt-1 text-3xl font-bold'>{formatUsd(revenueSummary?.totalUsdHistorical ?? 0)}</p>
            )}
            <p className='text-neutral mt-1 text-xs'>Each sub valued at the ETH/USD rate when it started</p>
          </div>
          <div className='card'>
            <p className='text-neutral text-sm font-medium'>USD (at current rate)</p>
            {revenueQuery.isLoading ? (
              <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
            ) : (
              <p className='mt-1 text-3xl font-bold'>{formatUsd(revenueSummary?.totalUsdAtCurrent)}</p>
            )}
            <p className='text-neutral mt-1 text-xs'>
              {revenueSummary?.currentEthUsd != null
                ? `1 ETH = ${formatUsd(revenueSummary.currentEthUsd)}`
                : 'No current price available'}
            </p>
          </div>
        </div>

        <div className='card mb-4'>
          <h3 className='mb-4 text-base font-semibold'>New Subscriptions Over Time</h3>
          {revenueQuery.isLoading ? (
            <div className='h-[360px] animate-pulse rounded bg-tertiary' />
          ) : revenue?.daily && revenue.daily.length > 0 && revenueSummary?.totalSubs ? (
            <ResponsiveContainer width='100%' height={360}>
              <ComposedChart data={revenue.daily} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
                <XAxis
                  dataKey='date'
                  stroke='var(--neutral)'
                  tick={{ fill: 'var(--neutral)', fontSize: 12 }}
                  tickFormatter={formatDateLabel}
                  interval='preserveStartEnd'
                />
                <YAxis
                  yAxisId='left'
                  stroke='var(--neutral)'
                  tick={{ fill: 'var(--neutral)', fontSize: 12 }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId='right'
                  orientation='right'
                  stroke='var(--neutral)'
                  tick={{ fill: 'var(--neutral)', fontSize: 12 }}
                  tickFormatter={(v: number) => `${v.toFixed(2)}`}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId='left'
                  dataKey='count'
                  fill='#3b82f6'
                  name='New subscriptions'
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId='right'
                  type='monotone'
                  dataKey='eth'
                  stroke='#22c55e'
                  strokeWidth={2}
                  dot={false}
                  name='ETH earned'
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className='flex h-[200px] items-center justify-center text-neutral text-sm'>
              No paid subscriptions in this window
            </div>
          )}
        </div>

        <div className='card overflow-hidden p-0'>
          <div className='flex items-center justify-between px-4 py-3 border-b border-border'>
            <h3 className='text-base font-semibold'>Subscriptions in Window</h3>
            {revenue?.subsTruncated && (
              <span className='text-neutral text-xs'>Showing the most recent {revenue.subsLimit}</span>
            )}
          </div>
          {revenueQuery.isLoading ? (
            <div className='h-48 animate-pulse bg-tertiary' />
          ) : revenue?.subs && revenue.subs.length > 0 ? (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border bg-tertiary'>
                    <th className='px-4 py-3 text-left font-medium text-neutral'>Started</th>
                    <th className='px-4 py-3 text-left font-medium text-neutral'>User</th>
                    <th className='px-4 py-3 text-left font-medium text-neutral'>Tier</th>
                    <th className='px-4 py-3 text-right font-medium text-neutral'>ETH</th>
                    <th className='px-4 py-3 text-right font-medium text-neutral'>USD (at sub)</th>
                    <th className='px-4 py-3 text-left font-medium text-neutral hidden md:table-cell'>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.subs.map((s: SubscriptionRevenueRow) => (
                    <tr key={s.id} className='border-b border-border last:border-0'>
                      <td className='px-4 py-3 whitespace-nowrap text-xs'>{formatDate(s.startedAt)}</td>
                      <td className='px-4 py-3 font-mono text-xs'>{s.address ? truncateAddress(s.address) : `uid ${s.userId}`}</td>
                      <td className='px-4 py-3 text-xs'>
                        {ALL_TIER_LABELS[s.tierId as keyof typeof ALL_TIER_LABELS] ?? s.tier}
                      </td>
                      <td className='px-4 py-3 text-right'>{formatEth(s.ethAmount)}</td>
                      <td className='px-4 py-3 text-right'>{formatUsd(s.usdAmount)}</td>
                      <td className='px-4 py-3 hidden md:table-cell'>
                        {s.paymentTxHash ? (
                          <a
                            href={`https://etherscan.io/tx/${s.paymentTxHash}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-primary font-mono text-xs hover:underline'
                          >
                            {s.paymentTxHash.slice(0, 6)}…{s.paymentTxHash.slice(-4)}
                          </a>
                        ) : (
                          <span className='text-neutral'>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='flex h-32 items-center justify-center text-neutral text-sm'>
              No paid subscriptions in this window
            </div>
          )}
        </div>
      </div>

      <h2 className='mb-3 text-xl font-semibold'>Tier-Gated Endpoint Usage</h2>

      {/* Summary Cards */}
      <div className='mb-6 grid grid-cols-3 gap-4'>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Gated Requests</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{(summary?.totalRequests ?? 0).toLocaleString()}</p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Plus+ Users</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{(summary?.uniqueUsers ?? 0).toLocaleString()}</p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Gated Routes Used</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{(summary?.uniqueRoutes ?? 0).toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className='card mb-6'>
        <h2 className='mb-4 text-lg font-semibold'>
          Gated Requests Over Time
          {selectedUser && (
            <span className='ml-2 text-sm font-normal text-neutral'>
              — highlighting {ensNames.get(selectedUser.toLowerCase()) || truncateAddress(selectedUser)}
            </span>
          )}
        </h2>
        {isLoading ? (
          <div className='h-[400px] animate-pulse rounded bg-tertiary' />
        ) : error || !data?.success ? (
          <div className='rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
            {data?.error || 'Failed to load subscriber analytics'}
          </div>
        ) : chartData && chartData.length > 0 ? (
          <ResponsiveContainer width='100%' height={400}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
              <XAxis
                dataKey='date'
                stroke='var(--neutral)'
                tick={{ fill: 'var(--neutral)', fontSize: 12 }}
                tickFormatter={formatDateLabel}
                interval='preserveStartEnd'
              />
              <YAxis
                stroke='var(--neutral)'
                tick={{ fill: 'var(--neutral)', fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey='total' fill='#3b82f6' name='Gated Requests' radius={[2, 2, 0, 0]} />
              {selectedUser && (
                <Bar dataKey='userTotal' fill='#f59e0b' name='User Requests' radius={[2, 2, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className='flex h-[400px] items-center justify-center text-neutral'>
            No data available for the selected date range
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className='mb-4 flex gap-2'>
        <button
          onClick={() => { setActiveTab('routes'); setSelectedUser(null) }}
          className={`btn text-sm ${activeTab === 'routes' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Top Gated Routes
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`btn text-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Top Plus+ Users
        </button>
      </div>

      {/* Top Routes */}
      {activeTab === 'routes' && (
        <div className='card overflow-hidden p-0'>
          {isLoading ? (
            <div className='h-64 animate-pulse bg-tertiary' />
          ) : analyticsData?.topRoutes && analyticsData.topRoutes.length > 0 ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border bg-tertiary'>
                  <th className='px-4 py-3 text-left font-medium text-neutral'>Route</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Requests</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Unique Users</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.topRoutes.map((route) => (
                  <tr key={route.route} className='border-b border-border last:border-0'>
                    <td className='px-4 py-3 font-mono text-xs'>{route.route}</td>
                    <td className='px-4 py-3 text-right'>{route.requestCount.toLocaleString()}</td>
                    <td className='px-4 py-3 text-right'>{route.uniqueUsers.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className='flex h-32 items-center justify-center text-neutral text-sm'>
              No gated-endpoint traffic in this window. (If this seems wrong, double-check the list in <code className='font-mono text-xs'>src/config/tierGatedRoutes.ts</code>.)
            </div>
          )}
        </div>
      )}

      {/* Top Users */}
      {activeTab === 'users' && !selectedUser && (
        <div className='card overflow-hidden p-0'>
          {isLoading ? (
            <div className='h-64 animate-pulse bg-tertiary' />
          ) : analyticsData?.topUsers && analyticsData.topUsers.length > 0 ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border bg-tertiary'>
                  <th className='px-4 py-3 text-left font-medium text-neutral'>User</th>
                  <th className='px-4 py-3 text-left font-medium text-neutral'>Tier</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Requests</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Unique Routes</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'></th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.topUsers.map((user) => (
                  <tr key={user.address} className='border-b border-border last:border-0'>
                    <td className='px-4 py-3'>
                      <span className='font-mono text-xs'>{truncateAddress(user.address)}</span>
                      {ensNames.get(user.address.toLowerCase()) && (
                        <span className='ml-2 text-xs text-neutral'>{ensNames.get(user.address.toLowerCase())}</span>
                      )}
                    </td>
                    <td className='px-4 py-3 text-xs'>
                      {ALL_TIER_LABELS[user.maxTierId as keyof typeof ALL_TIER_LABELS] ?? `t${user.maxTierId}`}
                    </td>
                    <td className='px-4 py-3 text-right'>{user.requestCount.toLocaleString()}</td>
                    <td className='px-4 py-3 text-right'>{user.uniqueRoutes.toLocaleString()}</td>
                    <td className='px-4 py-3 text-right'>
                      <button
                        onClick={() => handleSelectUser(user.address)}
                        className='text-xs text-primary hover:underline'
                      >
                        View Routes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className='flex h-32 items-center justify-center text-neutral text-sm'>
              No Plus+ users in this window
            </div>
          )}
        </div>
      )}

      {/* Drill-down */}
      {activeTab === 'users' && selectedUser && (
        <div className='card'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>
              Gated routes for{' '}
              <span className='font-mono text-sm'>
                {ensNames.get(selectedUser.toLowerCase()) || truncateAddress(selectedUser)}
              </span>
            </h2>
            <button onClick={() => setSelectedUser(null)} className='btn btn-secondary text-sm'>
              Back to All Users
            </button>
          </div>
          {userDrilldown ? (
            <div className='overflow-hidden rounded-lg border border-border'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border bg-tertiary'>
                    <th className='px-4 py-3 text-left font-medium text-neutral'>Route</th>
                    <th className='px-4 py-3 text-right font-medium text-neutral'>Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {userDrilldown.routes.map((r) => (
                    <tr key={r.route} className='border-b border-border last:border-0'>
                      <td className='px-4 py-3 font-mono text-xs'>{r.route}</td>
                      <td className='px-4 py-3 text-right'>{r.requestCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='h-32 animate-pulse rounded bg-tertiary' />
          )}
        </div>
      )}
    </div>
  )
}
