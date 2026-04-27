'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchSubscriptionRevenue,
  type SubscriptionRevenueRow,
} from '@/api/subscriptions/analytics'
import { ALL_TIER_LABELS } from '@/lib/tiers'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
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
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }
  const days = daysMap[preset] ?? 30
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  return { from: toISODate(from), to }
}

const PRESETS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: '180d', value: '180d' },
  { label: '365d', value: '365d' },
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

export default function SubscriptionRevenuePage() {
  const defaultRange = getPresetRange('30d')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState<string | null>('30d')

  const revenueQuery = useQuery({
    queryKey: ['subscription-revenue', dateRange.from, dateRange.to],
    queryFn: () => fetchSubscriptionRevenue(dateRange.from, dateRange.to),
  })
  const revenue = revenueQuery.data?.data
  const summary = revenue?.summary

  const handlePreset = (preset: string) => {
    setActivePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    setActivePreset(null)
    setDateRange((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Subscription Revenue</h1>
        <p className='text-neutral mt-1 text-sm'>
          ETH and USD earned from paid Grails Pro subscriptions. Admin grants and zero-amount rows are excluded.
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

      {/* Error */}
      {revenueQuery.error || (revenueQuery.data && !revenueQuery.data.success) ? (
        <div className='mb-6 rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
          {revenueQuery.data?.error || 'Failed to load subscription revenue'}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className='mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Paid Subscriptions</p>
          {revenueQuery.isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{(summary?.totalSubs ?? 0).toLocaleString()}</p>
          )}
          {summary && (
            <p className='text-neutral mt-1 text-xs'>
              {summary.uniqueUsers.toLocaleString()} unique user{summary.uniqueUsers === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>ETH Earned</p>
          {revenueQuery.isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalEth ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })}
            </p>
          )}
          <p className='text-neutral mt-1 text-xs'>Excludes admin grants</p>
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>USD (at sub time)</p>
          {revenueQuery.isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{formatUsd(summary?.totalUsdHistorical ?? 0)}</p>
          )}
          <p className='text-neutral mt-1 text-xs'>Each sub valued at the ETH/USD rate when it started</p>
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>USD (at current rate)</p>
          {revenueQuery.isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>{formatUsd(summary?.totalUsdAtCurrent)}</p>
          )}
          <p className='text-neutral mt-1 text-xs'>
            {summary?.currentEthUsd != null
              ? `1 ETH = ${formatUsd(summary.currentEthUsd)}`
              : 'No current price available'}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className='card mb-6'>
        <h2 className='mb-4 text-lg font-semibold'>New Subscriptions Over Time</h2>
        {revenueQuery.isLoading ? (
          <div className='h-[400px] animate-pulse rounded bg-tertiary' />
        ) : revenue?.daily && revenue.daily.length > 0 && summary?.totalSubs ? (
          <ResponsiveContainer width='100%' height={400}>
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
                tickFormatter={(v: number) => v.toFixed(2)}
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
          <div className='flex h-[400px] items-center justify-center text-neutral'>
            No paid subscriptions in this window
          </div>
        )}
      </div>

      {/* Subscriptions table */}
      <div className='card overflow-hidden p-0'>
        <div className='flex items-center justify-between border-b border-border px-4 py-3'>
          <h2 className='text-base font-semibold'>Subscriptions in Window</h2>
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
                    <td className='whitespace-nowrap px-4 py-3 text-xs'>{formatDate(s.startedAt)}</td>
                    <td className='px-4 py-3 font-mono text-xs'>
                      {s.address ? truncateAddress(s.address) : `uid ${s.userId}`}
                    </td>
                    <td className='px-4 py-3 text-xs'>
                      {ALL_TIER_LABELS[s.tierId as keyof typeof ALL_TIER_LABELS] ?? s.tier}
                    </td>
                    <td className='px-4 py-3 text-right'>{formatEth(s.ethAmount)}</td>
                    <td className='px-4 py-3 text-right'>{formatUsd(s.usdAmount)}</td>
                    <td className='hidden px-4 py-3 md:table-cell'>
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
  )
}
