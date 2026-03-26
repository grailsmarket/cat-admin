'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchOverviewStats, type OverviewMetric } from '@/api/stats/overview'
import DashboardLayout from '@/components/DashboardLayout'

function StatCard({
  label,
  metric,
  icon,
  colorClass,
  isLoading,
  error,
}: {
  label: string
  metric?: OverviewMetric
  icon: React.ReactNode
  colorClass: string
  isLoading: boolean
  error: boolean
}) {
  return (
    <div className='card'>
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-neutral text-sm font-medium'>{label}</p>
          {isLoading ? (
            <div className='h-9 w-24 bg-tertiary animate-pulse rounded mt-1' />
          ) : error ? (
            <p className='text-error text-sm'>Error loading</p>
          ) : metric ? (
            <div className='flex items-center gap-3 mt-1'>
              <span className='text-4xl font-bold'>
                {metric.total.toLocaleString()}
              </span>
              {[
                { label: '1d', value: metric.last1d },
                { label: '7d', value: metric.last7d },
                { label: '30d', value: metric.last30d },
              ].map(({ label: period, value }) => (
                <fieldset key={period} className='border border-border rounded px-2 pb-1.5 pt-0 min-w-0'>
                  <legend className='text-neutral text-xs px-1'>{period}</legend>
                  <span className='text-success text-sm font-medium'>+{value.toLocaleString()}</span>
                </fieldset>
              ))}
            </div>
          ) : null}
        </div>
        <div className={`${colorClass} rounded-lg p-3`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['overview-stats'],
    queryFn: fetchOverviewStats,
  })

  const stats = data?.data
  const hasError = !!error || (data?.success === false)

  return (
    <DashboardLayout>
      <div className='p-4 lg:p-8'>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold'>Dashboard</h1>
          <p className='text-neutral mt-1'>Platform overview</p>
        </div>

        {/* Stats Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <StatCard
            label='Users'
            metric={stats?.users}
            isLoading={isLoading}
            error={hasError}
            colorClass='bg-primary/10'
            icon={
              <svg className='h-6 w-6 text-primary' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' />
              </svg>
            }
          />

          <StatCard
            label='Name Views'
            metric={stats?.nameViews}
            isLoading={isLoading}
            error={hasError}
            colorClass='bg-success/10'
            icon={
              <svg className='h-6 w-6 text-success' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
              </svg>
            }
          />

          <StatCard
            label='Profile Views'
            metric={stats?.profileViews}
            isLoading={isLoading}
            error={hasError}
            colorClass='bg-warning/10'
            icon={
              <svg className='h-6 w-6 text-warning' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' />
              </svg>
            }
          />

          <StatCard
            label='API Requests'
            metric={stats?.apiRequests}
            isLoading={isLoading}
            error={hasError}
            colorClass='bg-primary/10'
            icon={
              <svg className='h-6 w-6 text-primary' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
              </svg>
            }
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
