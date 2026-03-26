'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchViewsAnalytics } from '@/api/analytics'
import { resolveAddresses } from '@/lib/ens'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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

  const daysMap: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
  }

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
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
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
              <span
                className='inline-block h-2 w-2 rounded-full'
                style={{ backgroundColor: entry.color }}
              />
              <span className='text-neutral'>{entry.name}:</span>
              <span className='font-medium'>{entry.value?.toLocaleString()}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function ViewsAnalyticsPage() {
  const defaultRange = getPresetRange('30d')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState<string | null>('30d')
  const [activeTab, setActiveTab] = useState<'names' | 'profiles'>('names')
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-views', dateRange.from, dateRange.to],
    queryFn: () => fetchViewsAnalytics(dateRange.from, dateRange.to),
  })

  const analyticsData = data?.data
  const summary = analyticsData?.summary

  // Resolve ENS names for top profiles
  useEffect(() => {
    if (!analyticsData?.topProfiles?.length) return

    const addresses = analyticsData.topProfiles.map((p) => p.address)
    resolveAddresses(addresses).then(setEnsNames)
  }, [analyticsData?.topProfiles])

  const handlePreset = (preset: string) => {
    setActivePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    setActivePreset(null)
    setDateRange((prev) => ({ ...prev, [field]: value }))
  }

  // Merge name and profile daily data for chart
  const chartData = analyticsData?.nameViewsDaily?.map((d, i) => ({
    date: d.date,
    nameViews: d.total,
    profileViews: analyticsData.profileViewsDaily[i]?.total ?? 0,
  }))

  return (
    <div className='p-4 lg:p-8'>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Views Analytics</h1>
        <p className='text-neutral mt-1'>Track name and profile view activity</p>
      </div>

      {/* Date Controls */}
      <div className='card mb-6'>
        <div className='mb-4 flex flex-wrap gap-2'>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={`btn text-sm ${
                activePreset === p.value ? 'btn-primary' : 'btn-secondary'
              }`}
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

      {/* Summary Cards */}
      <div className='mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Name Views</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalNameViews ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Unique Names</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.uniqueNames ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Profile Views</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalProfileViews ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Unique Profiles</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.uniqueProfiles ?? 0).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className='card mb-6'>
        <h2 className='mb-4 text-lg font-semibold'>Views Over Time</h2>
        {isLoading ? (
          <div className='h-[400px] animate-pulse rounded bg-tertiary' />
        ) : error || !data?.success ? (
          <div className='rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
            {data?.error || 'Failed to load views analytics'}
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
              <Legend />
              <Bar
                dataKey='nameViews'
                fill='#3b82f6'
                name='Name Views'
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey='profileViews'
                fill='#8b5cf6'
                name='Profile Views'
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className='flex h-[400px] items-center justify-center text-neutral'>
            No data available for the selected date range
          </div>
        )}
      </div>

      {/* Tab Toggles */}
      <div className='mb-4 flex gap-2'>
        <button
          onClick={() => setActiveTab('names')}
          className={`btn text-sm ${activeTab === 'names' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Top Names
        </button>
        <button
          onClick={() => setActiveTab('profiles')}
          className={`btn text-sm ${activeTab === 'profiles' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Top Profiles
        </button>
      </div>

      {/* Top Names Table */}
      {activeTab === 'names' && (
        <div className='card overflow-hidden p-0'>
          {isLoading ? (
            <div className='h-64 animate-pulse bg-tertiary' />
          ) : analyticsData?.topNames && analyticsData.topNames.length > 0 ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border bg-tertiary'>
                  <th className='px-4 py-3 text-left font-medium text-neutral'>Name</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Views</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Unique Viewers</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.topNames.map((name) => (
                  <tr key={name.name} className='border-b border-border last:border-0'>
                    <td className='px-4 py-3 font-medium'>{name.name}</td>
                    <td className='px-4 py-3 text-right'>{name.viewCount.toLocaleString()}</td>
                    <td className='px-4 py-3 text-right'>{name.uniqueViewers.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className='flex h-32 items-center justify-center text-neutral'>
              No name view data available
            </div>
          )}
        </div>
      )}

      {/* Top Profiles Table */}
      {activeTab === 'profiles' && (
        <div className='card overflow-hidden p-0'>
          {isLoading ? (
            <div className='h-64 animate-pulse bg-tertiary' />
          ) : analyticsData?.topProfiles && analyticsData.topProfiles.length > 0 ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border bg-tertiary'>
                  <th className='px-4 py-3 text-left font-medium text-neutral'>Profile</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Views</th>
                  <th className='px-4 py-3 text-right font-medium text-neutral'>Unique Viewers</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.topProfiles.map((profile) => (
                  <tr key={profile.address} className='border-b border-border last:border-0'>
                    <td className='px-4 py-3'>
                      <span className='font-mono text-xs'>{truncateAddress(profile.address)}</span>
                      {ensNames.get(profile.address.toLowerCase()) && (
                        <span className='ml-2 text-xs text-neutral'>
                          {ensNames.get(profile.address.toLowerCase())}
                        </span>
                      )}
                    </td>
                    <td className='px-4 py-3 text-right'>{profile.viewCount.toLocaleString()}</td>
                    <td className='px-4 py-3 text-right'>
                      {profile.uniqueViewers.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className='flex h-32 items-center justify-center text-neutral'>
              No profile view data available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
