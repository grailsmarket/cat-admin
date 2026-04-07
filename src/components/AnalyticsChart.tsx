'use client'

import { Fragment, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { SOURCE_NAMES, SOURCE_COLORS, type SourceName } from '@/constants/referrers'
import type { SourceBreakdown, CostBreakdown, DurationBreakdown } from '@/api/analytics'

export type DataMode = 'counts' | 'cost' | 'duration'

type AnalyticsChartProps = {
  registrations: SourceBreakdown[]
  renewals: SourceBreakdown[]
  registrationsCost: CostBreakdown[]
  renewalsCost: CostBreakdown[]
  registrationsDuration: DurationBreakdown[]
  renewalsDuration: DurationBreakdown[]
  bucket: 'hour' | 'day' | 'week'
  visibleSources: Record<SourceName, boolean>
  showRegistrations: boolean
  showRenewals: boolean
  showCombined: boolean
  chartType: 'line' | 'bar'
  dataMode: DataMode
}

type MergedDataPoint = {
  date: string
  [key: string]: string | number
}

function formatDateLabel(dateStr: string, bucket: 'hour' | 'day' | 'week'): string {
  const date = new Date(dateStr)
  if (bucket === 'hour') {
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomTooltip({
  active,
  payload,
  label,
  dataMode,
}: {
  active?: boolean
  payload?: ReadonlyArray<Payload<number, string>>
  label?: string
  dataMode: DataMode
}) {
  if (!active || !payload || payload.length === 0) return null

  const formatValue = (value: number | undefined) => {
    if (value === undefined) return '0'
    if (dataMode === 'cost') return `${value.toFixed(4)} ETH`
    if (dataMode === 'duration') return `${value.toFixed(2)} yrs`
    return value.toLocaleString()
  }

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
              <span className='font-medium'>{formatValue(entry.value)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function AnalyticsChart({
  registrations,
  renewals,
  registrationsCost,
  renewalsCost,
  registrationsDuration,
  renewalsDuration,
  bucket,
  visibleSources,
  showRegistrations,
  showRenewals,
  showCombined,
  chartType,
  dataMode,
}: AnalyticsChartProps) {
  const mergedData = useMemo(() => {
    const regData =
      dataMode === 'cost'
        ? registrationsCost
        : dataMode === 'duration'
          ? registrationsDuration
          : registrations
    const renData =
      dataMode === 'cost'
        ? renewalsCost
        : dataMode === 'duration'
          ? renewalsDuration
          : renewals

    const dateMap = new Map<string, MergedDataPoint>()

    for (const row of regData) {
      const point: MergedDataPoint = dateMap.get(row.date) || { date: row.date }
      for (const source of SOURCE_NAMES) {
        point[`reg_${source}`] = row[source] ?? 0
      }
      dateMap.set(row.date, point)
    }

    for (const row of renData) {
      const point: MergedDataPoint = dateMap.get(row.date) || { date: row.date }
      for (const source of SOURCE_NAMES) {
        point[`ren_${source}`] = row[source] ?? 0
      }
      dateMap.set(row.date, point)
    }

    // Compute combined keys
    for (const point of dateMap.values()) {
      for (const source of SOURCE_NAMES) {
        point[`combined_${source}`] =
          ((point[`reg_${source}`] as number) ?? 0) + ((point[`ren_${source}`] as number) ?? 0)
      }
    }

    return Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  }, [registrations, renewals, registrationsCost, renewalsCost, registrationsDuration, renewalsDuration, dataMode])

  const hasAnyData = mergedData.some((point) =>
    SOURCE_NAMES.some(
      (source) =>
        ((point[`reg_${source}`] as number) ?? 0) > 0 ||
        ((point[`ren_${source}`] as number) ?? 0) > 0
    )
  )

  if (!hasAnyData) {
    return (
      <div className='flex h-[400px] items-center justify-center text-neutral'>
        No data available for the selected date range
      </div>
    )
  }

  const sharedElements = (
    <>
      <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
      <XAxis
        dataKey='date'
        stroke='var(--neutral)'
        tick={{ fill: 'var(--neutral)', fontSize: 12 }}
        tickFormatter={(value) => formatDateLabel(value, bucket)}
        interval='preserveStartEnd'
      />
      <YAxis
        stroke='var(--neutral)'
        tick={{ fill: 'var(--neutral)', fontSize: 12 }}
        allowDecimals={dataMode !== 'counts'}
        tickFormatter={
          dataMode === 'cost'
            ? (value: number) => `${value.toFixed(2)}`
            : dataMode === 'duration'
              ? (value: number) => `${value.toFixed(1)}y`
              : undefined
        }
      />
      <Tooltip content={<CustomTooltip dataMode={dataMode} />} />
    </>
  )

  const dataSeriesElements = SOURCE_NAMES.map((source) => {
    if (!visibleSources[source]) return null

    if (chartType === 'bar') {
      return (
        <Fragment key={`series_${source}`}>
          {showRegistrations && (
            <Bar
              dataKey={`reg_${source}`}
              fill={SOURCE_COLORS[source]}
              name={`Registrations (${source})`}
              stackId='registrations'
            />
          )}
          {showRenewals && (
            <Bar
              dataKey={`ren_${source}`}
              fill={SOURCE_COLORS[source]}
              name={`Renewals (${source})`}
              stackId='renewals'
              fillOpacity={0.5}
            />
          )}
          {showCombined && (
            <Bar
              dataKey={`combined_${source}`}
              fill={SOURCE_COLORS[source]}
              name={`Combined (${source})`}
              stackId='combined'
              fillOpacity={0.75}
            />
          )}
        </Fragment>
      )
    }

    return (
      <Fragment key={`series_${source}`}>
        {showRegistrations && (
          <Line
            type='monotone'
            dataKey={`reg_${source}`}
            stroke={SOURCE_COLORS[source]}
            strokeWidth={2}
            dot={false}
            name={`Registrations (${source})`}
            connectNulls
          />
        )}
        {showRenewals && (
          <Line
            type='monotone'
            dataKey={`ren_${source}`}
            stroke={SOURCE_COLORS[source]}
            strokeWidth={2}
            strokeDasharray='5 5'
            dot={false}
            name={`Renewals (${source})`}
            connectNulls
          />
        )}
        {showCombined && (
          <Line
            type='monotone'
            dataKey={`combined_${source}`}
            stroke={SOURCE_COLORS[source]}
            strokeWidth={3}
            dot={false}
            name={`Combined (${source})`}
            connectNulls
          />
        )}
      </Fragment>
    )
  })

  return (
    <ResponsiveContainer width='100%' height={400}>
      {chartType === 'bar' ? (
        <BarChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          {sharedElements}
          {dataSeriesElements}
        </BarChart>
      ) : (
        <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          {sharedElements}
          {dataSeriesElements}
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
