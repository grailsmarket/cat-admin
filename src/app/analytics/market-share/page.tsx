'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
} from 'recharts'
import { fetchMarketShare, type MarketShareChannel, type RenewalChannelStats } from '@/api/analytics'
import { ENSV2_LAUNCH_DATE, SOURCE_COLORS } from '@/constants/referrers'
import { resolveAddresses } from '@/lib/ens'

const CHANNELS: Record<MarketShareChannel, { label: string; color: string }> = {
  grails_eth: { label: 'Grails · ETH router', color: SOURCE_COLORS.grails },
  grails_stable: { label: 'Grails · USDC/DAI', color: '#93c5fd' },
  relay: { label: 'Smart-account relay (likely ENS app)', color: '#f97316' },
  direct: { label: 'No referrer', color: SOURCE_COLORS.direct },
  namewhisper: { label: 'NameWhisper', color: SOURCE_COLORS.namewhisper },
  vision: { label: 'Vision', color: SOURCE_COLORS.vision },
  snipezone: { label: 'SnipeZone', color: SOURCE_COLORS.snipezone },
  enstools: { label: 'ENS Tools', color: SOURCE_COLORS.enstools },
  rotki: { label: 'Rotki', color: SOURCE_COLORS.rotki },
}

const OTHERS_COLOR = '#6b7280'
const REGISTRATIONS_COLOR = '#a78bfa'

const DURATION_BUCKETS: Array<{
  key: keyof RenewalChannelStats
  label: string
  color: string
}> = [
  { key: 'd_under_7d', label: 'Under 7 days', color: '#1d4ed8' },
  { key: 'd_7_29d', label: '7–29 days', color: '#3b82f6' },
  { key: 'd_30_89d', label: '30–89 days', color: '#60a5fa' },
  { key: 'd_90_363d', label: '90 days – 1 year', color: '#93c5fd' },
  { key: 'd_1y_plus', label: '1 year or more', color: '#cbd5e1' },
  { key: 'd_unknown', label: 'Unknown', color: '#4b5563' },
]

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const int = (v: number) => Math.round(v).toLocaleString()
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`
const usd2 = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`)
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Monday (UTC) of the ENSv2 launch week, to mark it on the weekly chart
const LAUNCH_WEEK = (() => {
  const d = new Date(`${ENSV2_LAUNCH_DATE}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return toISODate(d)
})()

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = toISODate(now)
  if (preset === 'v2') return { from: ENSV2_LAUNCH_DATE, to }
  const days = { '7d': 7, '30d': 30, '90d': 90 }[preset] ?? 30
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  return { from: toISODate(from), to }
}

const PRESETS = [
  { label: 'Since ENSv2 launch', value: 'v2' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'Custom', value: 'custom' },
]

const tick = { fill: 'var(--neutral)', fontSize: 12 }

function ChartTooltip({
  active,
  payload,
  label,
  format = int,
  labelFormat = (l) => String(l ?? ''),
}: {
  active?: boolean
  payload?: ReadonlyArray<{
    name?: string | number
    value?: number | string
    color?: string
    dataKey?: unknown
  }>
  label?: string | number
  format?: (v: number) => string
  labelFormat?: (label: string | number | undefined) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className='rounded-lg border border-border bg-secondary p-3 shadow-lg'>
      <p className='mb-2 text-sm font-medium'>{labelFormat(label)}</p>
      <div className='space-y-1'>
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className='flex items-center gap-2 text-xs'>
            <span className='inline-block h-2 w-2 rounded-full' style={{ backgroundColor: entry.color }} />
            <span className='text-neutral'>{entry.name}:</span>
            <span className='font-medium'>{format(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className='card min-w-0'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      {note && <p className='text-neutral mt-1 text-sm'>{note}</p>}
      <div className='mt-4'>{children}</div>
    </div>
  )
}

export default function MarketSharePage() {
  const [dateRange, setDateRange] = useState(() => getPresetRange('v2'))
  const [activePreset, setActivePreset] = useState<string | null>('v2')
  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-market-share', dateRange.from, dateRange.to],
    queryFn: () => fetchMarketShare(dateRange.from, dateRange.to),
  })
  const ms = data?.data

  useEffect(() => {
    const wallets = ms?.topRenewers.map((r) => r.wallet) ?? []
    if (wallets.length > 0) resolveAddresses(wallets).then(setEnsNames)
  }, [ms?.topRenewers])

  const measureRows = useMemo(() => {
    if (!ms) return []
    return ms.measures.renewals.map((r, i) => {
      const reg = ms.measures.registrations[i]
      return {
        measure: r.measure,
        renewals: r.share,
        registrations: reg.share,
        renewalsDetail: `${int(r.grails)} of ${int(r.total)}`,
        registrationsDetail: `${int(reg.grails)} of ${int(reg.total)}`,
      }
    })
  }, [ms])

  const durationRows = useMemo(() => {
    if (!ms) return []
    return ms.renewalChannels
      .filter((c) => c.names > 0)
      .map((c) => {
        const row: Record<string, string | number> = {
          channel: CHANNELS[c.channel]?.label ?? c.channel,
        }
        for (const b of DURATION_BUCKETS) row[b.label] = Number(c[b.key]) / c.names
        return row
      })
  }, [ms])

  const totalRegistrations = ms?.registrationChannels.reduce((s, c) => s + c.names, 0) ?? 0
  const grailsRenewals = ms?.measures.renewals[0]?.grails ?? 0
  const launchWeek = ms?.weekly.find((w) => w.date.slice(0, 10) === LAUNCH_WEEK)?.date

  const handlePreset = (preset: string) => {
    setActivePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Market Share</h1>
        <p className='text-neutral mt-1 max-w-3xl'>
          Grails&apos; share of .eth registrations and renewals, counted several ways. Counting names alone favors
          anyone who renews many names at once for a short time, so compare it with USD, name-years and transactions.
        </p>
      </div>

      <div className='card mb-6'>
        <p className='text-neutral mb-2 text-xs font-medium uppercase tracking-wide'>Period</p>
        <div className='flex flex-wrap items-center gap-2'>
          <select
            id='market-share-period'
            value={activePreset ?? 'custom'}
            onChange={(e) => (e.target.value === 'custom' ? setActivePreset(null) : handlePreset(e.target.value))}
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
              {(['from', 'to'] as const).map((field, i) => (
                <span key={field} className='flex items-center gap-2'>
                  {i === 1 && <span className='text-neutral text-sm'>to</span>}
                  <input
                    id={`market-share-${field}`}
                    type='date'
                    value={dateRange[field]}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                    className='rounded-lg border border-border bg-tertiary px-3 py-2 text-sm focus:border-primary focus:outline-none'
                  />
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className='card'>
          <div className='h-[400px] animate-pulse rounded bg-tertiary' />
        </div>
      ) : error || !data?.success || !ms ? (
        <div className='rounded-lg border border-error bg-error/10 p-4 text-sm text-error'>
          {data?.error || 'Failed to load market share data'}
        </div>
      ) : (
        <div className='grid gap-6'>
          {ms.routerError && (
            <div className='rounded-lg border border-warning bg-warning/10 p-4 text-sm text-warning'>
              Couldn&apos;t read ETH router logs ({ms.routerError}). Grails activity paid in ETH is counted under
              USDC/DAI below.
            </div>
          )}

          <Card
            title='Grails share by measure'
            note='Share of all registrations and renewals in the period that carried a Grails referrer. Name-years sum the length bought across names.'
          >
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={measureRows} layout='vertical' margin={{ top: 5, right: 40, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' horizontal={false} />
                <XAxis type='number' tick={tick} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <YAxis type='category' dataKey='measure' tick={tick} width={100} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className='rounded-lg border border-border bg-secondary p-3 text-xs shadow-lg'>
                        <p className='mb-2 text-sm font-medium'>{label}</p>
                        {payload.map((p) => {
                          const row = p.payload as (typeof measureRows)[number]
                          const detail = p.dataKey === 'renewals' ? row.renewalsDetail : row.registrationsDetail
                          return (
                            <div key={String(p.dataKey)} className='flex items-center gap-2'>
                              <span
                                className='inline-block h-2 w-2 rounded-full'
                                style={{ backgroundColor: p.color }}
                              />
                              <span className='text-neutral'>{p.name}:</span>
                              <span className='font-medium'>
                                {pct(Number(p.value))} ({detail})
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ) : null
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey='renewals' name='Renewals' fill={SOURCE_COLORS.grails} radius={[0, 3, 3, 0]} />
                <Bar dataKey='registrations' name='Registrations' fill={REGISTRATIONS_COLOR} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className='mt-4 overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr>
                    <th className='text-left'>Measure</th>
                    <th style={{ textAlign: 'right' }}>Renewals: Grails</th>
                    <th style={{ textAlign: 'right' }}>Share</th>
                    <th style={{ textAlign: 'right' }}>Registrations: Grails</th>
                    <th style={{ textAlign: 'right' }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {measureRows.map((r) => (
                    <tr key={r.measure}>
                      <td>{r.measure}</td>
                      <td className='text-right'>{r.renewalsDetail}</td>
                      <td className='text-right'>{pct(r.renewals)}</td>
                      <td className='text-right'>{r.registrationsDetail}</td>
                      <td className='text-right'>{pct(r.registrations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className='grid gap-6 xl:grid-cols-[2fr_1fr]'>
            <Card
              title='Names renewed per week'
              note='Starts 8 weeks before the period. Weeks start Monday (UTC); the current week is partial.'
            >
              <ResponsiveContainer width='100%' height={300}>
                <BarChart data={ms.weekly} margin={{ top: 15, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' vertical={false} />
                  <XAxis dataKey='date' tick={tick} tickFormatter={dateLabel} />
                  <YAxis tick={tick} />
                  <Tooltip content={<ChartTooltip labelFormat={(l) => `Week of ${dateLabel(String(l))}`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {launchWeek && (
                    <ReferenceLine
                      x={launchWeek}
                      stroke='var(--neutral)'
                      strokeDasharray='4 3'
                      label={{
                        value: 'ENSv2',
                        position: 'top',
                        fill: 'var(--neutral)',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Bar dataKey='grails' name='Grails' stackId='w' fill={SOURCE_COLORS.grails} />
                  <Bar dataKey='others' name='Everyone else' stackId='w' fill={OTHERS_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card
              title='Renewals per day vs previous period'
              note={`Average per day. The previous period is the ${Math.round(ms.comparison.periodDays)} days before this one.`}
            >
              <table className='w-full text-sm'>
                <thead>
                  <tr>
                    <th className='text-left'>Period</th>
                    <th style={{ textAlign: 'right' }}>Grails</th>
                    <th style={{ textAlign: 'right' }}>Everyone else</th>
                    <th style={{ textAlign: 'right' }}>Grails share</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Previous', ...ms.comparison.previous },
                    { label: 'This period', ...ms.comparison.current },
                  ].map((p) => {
                    const total = p.grailsPerDay + p.othersPerDay
                    return (
                      <tr key={p.label}>
                        <td>{p.label}</td>
                        <td className='text-right'>{int(p.grailsPerDay)}</td>
                        <td className='text-right'>{int(p.othersPerDay)}</td>
                        <td className='text-right'>{total > 0 ? pct(p.grailsPerDay / total) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          <Card
            title={`Renewals per ${ms.bucket} by payment`}
            note={`ETH router transactions are read from chain (${int(ms.routerTxCount)} since its Oct 28 deploy). UTC ${ms.bucket}s; the last one may be partial.`}
          >
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={ms.series} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' vertical={false} />
                <XAxis dataKey='date' tick={tick} tickFormatter={dateLabel} />
                <YAxis tick={tick} />
                <Tooltip content={<ChartTooltip labelFormat={(l) => dateLabel(String(l))} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey='grails_eth'
                  name={CHANNELS.grails_eth.label}
                  stackId='d'
                  fill={CHANNELS.grails_eth.color}
                />
                <Bar
                  dataKey='grails_stable'
                  name={CHANNELS.grails_stable.label}
                  stackId='d'
                  fill={CHANNELS.grails_stable.color}
                />
                <Bar dataKey='others' name='Everyone else' stackId='d' fill={OTHERS_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title='Renewal length by channel' note="Share of each channel's renewals by length bought.">
            <ResponsiveContainer width='100%' height={Math.max(200, durationRows.length * 44 + 60)}>
              <BarChart
                data={durationRows}
                layout='vertical'
                stackOffset='expand'
                margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
              >
                <XAxis type='number' tick={tick} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <YAxis type='category' dataKey='channel' tick={tick} width={230} />
                <Tooltip content={<ChartTooltip format={pct} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {DURATION_BUCKETS.map((b) => (
                  <Bar key={b.label} dataKey={b.label} stackId='len' fill={b.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card
            title='Grace-period renewals by channel'
            note='"Already expired": the name was past its expiry when renewed. "Still expired": it was still expired after the renewal, which only pushed back the date it is released.'
          >
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr>
                    <th className='text-left'>Channel</th>
                    <th style={{ textAlign: 'right' }}>Renewals</th>
                    <th style={{ textAlign: 'right' }}>Transactions</th>
                    <th style={{ textAlign: 'right' }}>Names per tx</th>
                    <th style={{ textAlign: 'right' }}>Name-years</th>
                    <th style={{ textAlign: 'right' }}>USD</th>
                    <th style={{ textAlign: 'right' }}>Median per name</th>
                    <th style={{ textAlign: 'right' }}>Already expired</th>
                    <th style={{ textAlign: 'right' }}>Still expired after</th>
                  </tr>
                </thead>
                <tbody>
                  {ms.renewalChannels.map((c) => (
                    <tr key={c.channel}>
                      <td>
                        <div className='flex items-center gap-2'>
                          <span
                            className='inline-block h-2.5 w-2.5 rounded-full'
                            style={{
                              backgroundColor: CHANNELS[c.channel]?.color ?? OTHERS_COLOR,
                            }}
                          />
                          {CHANNELS[c.channel]?.label ?? c.channel}
                        </div>
                      </td>
                      <td className='text-right'>{int(c.names)}</td>
                      <td className='text-right'>{int(c.txs)}</td>
                      <td className='text-right'>{c.txs > 0 ? (c.names / c.txs).toFixed(1) : '—'}</td>
                      <td className='text-right'>{c.name_years.toFixed(1)}</td>
                      <td className='text-right'>{usd(c.usd)}</td>
                      <td className='text-right'>{usd2(c.median_usd)}</td>
                      <td className='text-right'>
                        {c.with_duration > 0 ? pct(c.already_expired / c.with_duration) : '—'}
                      </td>
                      <td className='text-right'>
                        {c.with_duration > 0 ? pct(c.still_expired / c.with_duration) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title='Top 10 Grails renewers' note='Wallet = transaction sender.'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr>
                    <th className='text-left'>Wallet</th>
                    <th style={{ textAlign: 'right' }}>Renewals</th>
                    <th style={{ textAlign: 'right' }}>Share of Grails</th>
                    <th style={{ textAlign: 'right' }}>Transactions</th>
                    <th style={{ textAlign: 'right' }}>Median days</th>
                    <th style={{ textAlign: 'right' }}>Still expired after</th>
                    <th className='text-left'>Paid with</th>
                  </tr>
                </thead>
                <tbody>
                  {ms.topRenewers.map((r) => (
                    <tr key={r.wallet}>
                      <td title={r.wallet}>{ensNames.get(r.wallet) ?? shortAddr(r.wallet)}</td>
                      <td className='text-right'>{int(r.names)}</td>
                      <td className='text-right'>{grailsRenewals > 0 ? pct(r.names / grailsRenewals) : '—'}</td>
                      <td className='text-right'>{int(r.txs)}</td>
                      <td className='text-right'>{r.median_days == null ? '—' : r.median_days.toFixed(0)}</td>
                      <td className='text-right'>
                        {r.with_duration > 0 ? pct(r.still_expired / r.with_duration) : '—'}
                      </td>
                      <td>{[r.paid_eth && 'ETH', r.paid_stable && 'USDC/DAI'].filter(Boolean).join(' + ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title='Registrations by channel'
            note='The smart-account relay submits one transaction per user, pays gas in USDC and deploys a per-name resolver. It is very likely the ENS app, but that is inferred from on-chain behaviour.'
          >
            <ResponsiveContainer width='100%' height={Math.max(160, ms.registrationChannels.length * 40 + 40)}>
              <BarChart
                data={ms.registrationChannels.map((c) => ({
                  ...c,
                  label: CHANNELS[c.channel]?.label ?? c.channel,
                }))}
                layout='vertical'
                margin={{ top: 5, right: 60, bottom: 5, left: 10 }}
              >
                <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' horizontal={false} />
                <XAxis type='number' tick={tick} />
                <YAxis type='category' dataKey='label' tick={tick} width={230} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className='rounded-lg border border-border bg-secondary p-3 text-xs shadow-lg'>
                        <p className='mb-1 text-sm font-medium'>{payload[0].payload.label}</p>
                        <p>
                          {int(payload[0].payload.names)} registrations (
                          {totalRegistrations > 0 ? pct(payload[0].payload.names / totalRegistrations) : '—'})
                        </p>
                        <p className='text-neutral'>{usd(payload[0].payload.usd)} paid</p>
                      </div>
                    ) : null
                  }
                />
                <Bar
                  dataKey='names'
                  name='Registrations'
                  radius={[0, 3, 3, 0]}
                  label={{
                    position: 'right',
                    fill: 'var(--neutral)',
                    fontSize: 12,
                    formatter: (v: unknown) =>
                      totalRegistrations > 0 ? `${int(Number(v))} · ${pct(Number(v) / totalRegistrations)}` : '',
                  }}
                >
                  {ms.registrationChannels.map((c) => (
                    <Cell key={c.channel} fill={CHANNELS[c.channel]?.color ?? OTHERS_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className='text-neutral max-w-3xl space-y-1 text-xs'>
            <p>
              Wallets and transactions use the transaction sender. The relay sends every one of its users&apos;
              transactions, so it counts as one wallet.
            </p>
            <p>
              USD is the value at the time, from the database (stablecoins at face value, ETH at the price feed).
              Zero-cost <code>ETHRenewerV1.syncWrapper()</code> rows are excluded.
            </p>
            <p>
              Older v1 renewals made directly through the controller may have no recorded length, so they show as
              Unknown and are left out of name-years and the grace-period columns.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
