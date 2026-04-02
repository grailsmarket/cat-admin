'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRegistrationAnalytics } from '@/api/analytics'
import { SOURCE_NAMES, SOURCE_COLORS, type SourceName } from '@/constants/referrers'
import AnalyticsChart from '@/components/AnalyticsChart'

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
    '1y': 365,
    all: 365 * 8,
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
  { label: '1y', value: '1y' },
  { label: 'All', value: 'all' },
]

export default function AnalyticsPage() {
  const defaultRange = getPresetRange('30d')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState<string | null>('30d')
  const [showRegistrations, setShowRegistrations] = useState(true)
  const [showRenewals, setShowRenewals] = useState(true)
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const [dataMode, setDataMode] = useState<'counts' | 'cost'>('counts')
  const [visibleSources, setVisibleSources] = useState<Record<SourceName, boolean>>(
    () => Object.fromEntries(SOURCE_NAMES.map((s) => [s, true])) as Record<SourceName, boolean>
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-registrations', dateRange.from, dateRange.to],
    queryFn: () => fetchRegistrationAnalytics(dateRange.from, dateRange.to),
  })

  const analyticsData = data?.data
  const summary = analyticsData?.summary

  const handlePreset = (preset: string) => {
    setActivePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    setActivePreset(null)
    setDateRange((prev) => ({ ...prev, [field]: value }))
  }

  const toggleSource = (source: SourceName) => {
    setVisibleSources((prev) => ({ ...prev, [source]: !prev[source] }))
  }

  return (
    <div className='p-4 lg:p-8'>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Registration & Renewal Analytics</h1>
        <p className='text-neutral mt-1'>Track registrations and renewals by source over time</p>
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

      {/* Toggle Controls */}
      <div className='card mb-6'>
        <div className='flex flex-wrap gap-8'>
          {/* Event Type Toggles */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Event Type
            </p>
            <div className='flex flex-col gap-2'>
              <label className='flex cursor-pointer items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={showRegistrations}
                  onChange={(e) => setShowRegistrations(e.target.checked)}
                />
                <span className='inline-block h-[2px] w-4 bg-foreground' />
                Registrations
              </label>
              <label className='flex cursor-pointer items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={showRenewals}
                  onChange={(e) => setShowRenewals(e.target.checked)}
                />
                <span
                  className='inline-block h-[2px] w-4 bg-foreground'
                  style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--foreground) 0 3px, transparent 3px 5px)' , backgroundColor: 'transparent' }}
                />
                Renewals
              </label>
            </div>
          </div>

          {/* Source Toggles */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Sources
            </p>
            <div className='flex flex-wrap gap-x-4 gap-y-2'>
              {SOURCE_NAMES.map((source) => (
                <label key={source} className='flex cursor-pointer items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={visibleSources[source]}
                    onChange={() => toggleSource(source)}
                  />
                  <span
                    className='inline-block h-2.5 w-2.5 rounded-full'
                    style={{ backgroundColor: SOURCE_COLORS[source] }}
                  />
                  {source}
                </label>
              ))}
            </div>
          </div>

          {/* Data Mode */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Data Mode
            </p>
            <div className='flex gap-2'>
              <button
                onClick={() => setDataMode('counts')}
                className={`btn text-sm ${dataMode === 'counts' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Counts
              </button>
              <button
                onClick={() => setDataMode('cost')}
                className={`btn text-sm ${dataMode === 'cost' ? 'btn-primary' : 'btn-secondary'}`}
              >
                ETH Spent
              </button>
            </div>
          </div>

          {/* Chart Type */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Chart Type
            </p>
            <div className='flex gap-2'>
              <button
                onClick={() => setChartType('line')}
                className={`btn text-sm ${chartType === 'line' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Line
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`btn text-sm ${chartType === 'bar' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Bar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className='mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Total Registrations</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalRegistrations ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Total Renewals</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalRenewals ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Registration Cost</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalRegistrationCostEth ?? 0).toFixed(2)}
              <span className='text-lg font-normal text-neutral'> ETH</span>
            </p>
          )}
        </div>
        <div className='card'>
          <p className='text-neutral text-sm font-medium'>Renewal Cost</p>
          {isLoading ? (
            <div className='mt-1 h-9 w-20 animate-pulse rounded bg-tertiary' />
          ) : (
            <p className='mt-1 text-3xl font-bold'>
              {(summary?.totalRenewalCostEth ?? 0).toFixed(2)}
              <span className='text-lg font-normal text-neutral'> ETH</span>
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className='card'>
        <h2 className='mb-4 text-lg font-semibold'>
          {dataMode === 'cost' ? 'ETH Spent Over Time' : 'Volume Over Time'}
        </h2>
        {isLoading ? (
          <div className='h-[400px] animate-pulse rounded bg-tertiary' />
        ) : error || !data?.success ? (
          <div className='rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
            {data?.error || 'Failed to load analytics data'}
          </div>
        ) : analyticsData ? (
          <AnalyticsChart
            registrations={analyticsData.registrations}
            renewals={analyticsData.renewals}
            registrationsCost={analyticsData.registrationsCost}
            renewalsCost={analyticsData.renewalsCost}
            bucket={analyticsData.bucket}
            visibleSources={visibleSources}
            showRegistrations={showRegistrations}
            showRenewals={showRenewals}
            chartType={chartType}
            dataMode={dataMode}
          />
        ) : null}
      </div>
    </div>
  )
}
