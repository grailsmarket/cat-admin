'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRegistrationAnalytics } from '@/api/analytics'
import { SOURCE_NAMES as ALL_SOURCE_NAMES, SOURCE_COLORS, type SourceName } from '@/constants/referrers'

const SOURCE_NAMES = ALL_SOURCE_NAMES.filter((s) => s !== 'rotki')
import AnalyticsChart, { type DataMode } from '@/components/AnalyticsChart'

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
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: '1 year', value: '1y' },
  { label: 'All time', value: 'all' },
  { label: 'Custom', value: 'custom' },
]

export default function AnalyticsPage() {
  const defaultRange = getPresetRange('30d')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState<string | null>('30d')
  const [showRegistrations, setShowRegistrations] = useState(true)
  const [showRenewals, setShowRenewals] = useState(true)
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const [dataMode, setDataMode] = useState<DataMode>('counts')
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

      {/* Controls */}
      <div className='card mb-6'>
        <div className='flex flex-wrap items-start gap-6'>
          {/* Period */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>Period</p>
            <div className='flex flex-wrap items-center gap-2'>
              <select
                value={activePreset ?? 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setActivePreset(null)
                  } else {
                    handlePreset(e.target.value)
                  }
                }}
                className='text-sm'
              >
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {activePreset === null && (
                <>
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
                </>
              )}
            </div>
          </div>

          {/* Event Type */}
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
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, var(--foreground) 0 3px, transparent 3px 5px)',
                    backgroundColor: 'transparent',
                  }}
                />
                Renewals
              </label>
            </div>
          </div>

          {/* Sources */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Sources
            </p>
            <div className='grid grid-cols-3 gap-x-4 gap-y-2'>
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
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className='text-sm'
            >
              <option value='counts'>Counts</option>
              <option value='cost'>ETH Spent</option>
              <option value='duration'>Duration</option>
            </select>
          </div>

          {/* Chart Type */}
          <div>
            <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>
              Chart Type
            </p>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'line' | 'bar')}
              className='text-sm'
            >
              <option value='line'>Line</option>
              <option value='bar'>Bar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className='card'>
        <h2 className='mb-4 text-lg font-semibold'>
          {dataMode === 'cost'
            ? 'ETH Spent Over Time'
            : dataMode === 'duration'
              ? 'Duration Over Time'
              : 'Volume Over Time'}
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
            registrationsDuration={analyticsData.registrationsDuration}
            renewalsDuration={analyticsData.renewalsDuration}
            bucket={analyticsData.bucket}
            visibleSources={visibleSources}
            showRegistrations={showRegistrations}
            showRenewals={showRenewals}
            chartType={chartType}
            dataMode={dataMode}
          />
        ) : null}
      </div>

      {/* Summary Table */}
      {isLoading ? (
        <div className='card mt-6'>
          <div className='h-[200px] animate-pulse rounded bg-tertiary' />
        </div>
      ) : summary ? (
        <div className='card mt-6'>
          <h2 className='mb-4 text-lg font-semibold'>Summary</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr>
                  <th className='text-left'>Source</th>
                  <th style={{ textAlign: 'right' }}>Regs</th>
                  <th style={{ textAlign: 'right' }}>Reg Cost (ETH)</th>
                  <th style={{ textAlign: 'right' }}>Reg Duration (yrs)</th>
                  <th style={{ textAlign: 'right' }}>Renewals</th>
                  <th style={{ textAlign: 'right' }}>Ren Cost (ETH)</th>
                  <th style={{ textAlign: 'right' }}>Ren Duration (yrs)</th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_NAMES.map((source) => (
                  <tr key={source}>
                    <td>
                      <div className='flex items-center gap-2'>
                        <span
                          className='inline-block h-2.5 w-2.5 rounded-full'
                          style={{ backgroundColor: SOURCE_COLORS[source] }}
                        />
                        {source}
                      </div>
                    </td>
                    <td className='text-right'>
                      {(summary.registrationsBySource[source] ?? 0).toLocaleString()}
                    </td>
                    <td className='text-right'>
                      {(summary.registrationsCostBySource[source] ?? 0).toFixed(4)}
                    </td>
                    <td className='text-right'>
                      {(summary.registrationsDurationBySource[source] ?? 0).toFixed(2)}
                    </td>
                    <td className='text-right'>
                      {(summary.renewalsBySource[source] ?? 0).toLocaleString()}
                    </td>
                    <td className='text-right'>
                      {(summary.renewalsCostBySource[source] ?? 0).toFixed(4)}
                    </td>
                    <td className='text-right'>
                      {(summary.renewalsDurationBySource[source] ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className='font-semibold' style={{ borderTop: '2px solid var(--border)' }}>
                  <td>Total</td>
                  <td className='text-right'>
                    {(summary.totalRegistrations ?? 0).toLocaleString()}
                  </td>
                  <td className='text-right'>
                    {(summary.totalRegistrationCostEth ?? 0).toFixed(4)}
                  </td>
                  <td className='text-right'>
                    {(summary.totalRegistrationDurationYears ?? 0).toFixed(2)}
                  </td>
                  <td className='text-right'>
                    {(summary.totalRenewals ?? 0).toLocaleString()}
                  </td>
                  <td className='text-right'>
                    {(summary.totalRenewalCostEth ?? 0).toFixed(4)}
                  </td>
                  <td className='text-right'>
                    {(summary.totalRenewalDurationYears ?? 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
