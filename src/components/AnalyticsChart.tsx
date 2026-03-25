'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'
import { SOURCE_NAMES, SOURCE_COLORS, type SourceName } from '@/constants/referrers'
import type { SourceBreakdown } from '@/api/analytics'

type AnalyticsChartProps = {
  registrations: SourceBreakdown[]
  renewals: SourceBreakdown[]
  bucket: 'hour' | 'day' | 'week'
  visibleSources: Record<SourceName, boolean>
  showRegistrations: boolean
  showRenewals: boolean
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

export default function AnalyticsChart({
  registrations,
  renewals,
  bucket,
  visibleSources,
  showRegistrations,
  showRenewals,
}: AnalyticsChartProps) {
  const mergedData = useMemo(() => {
    const dateMap = new Map<string, MergedDataPoint>()

    for (const row of registrations) {
      const point: MergedDataPoint = dateMap.get(row.date) || { date: row.date }
      for (const source of SOURCE_NAMES) {
        point[`reg_${source}`] = row[source] ?? 0
      }
      dateMap.set(row.date, point)
    }

    for (const row of renewals) {
      const point: MergedDataPoint = dateMap.get(row.date) || { date: row.date }
      for (const source of SOURCE_NAMES) {
        point[`ren_${source}`] = row[source] ?? 0
      }
      dateMap.set(row.date, point)
    }

    return Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  }, [registrations, renewals])

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

  return (
    <ResponsiveContainer width='100%' height={400}>
      <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />

        {SOURCE_NAMES.map(
          (source) =>
            visibleSources[source] && (
              <Line
                key={`reg_${source}`}
                type='monotone'
                dataKey={`reg_${source}`}
                stroke={SOURCE_COLORS[source]}
                strokeWidth={2}
                dot={false}
                name={`Registrations (${source})`}
                hide={!showRegistrations}
                connectNulls
              />
            )
        )}

        {SOURCE_NAMES.map(
          (source) =>
            visibleSources[source] && (
              <Line
                key={`ren_${source}`}
                type='monotone'
                dataKey={`ren_${source}`}
                stroke={SOURCE_COLORS[source]}
                strokeWidth={2}
                strokeDasharray='5 5'
                dot={false}
                name={`Renewals (${source})`}
                hide={!showRenewals}
                connectNulls
              />
            )
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
