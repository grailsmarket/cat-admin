'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  fetchSubscriptions,
  cancelSubscription,
  extendSubscription,
  grantSubscription,
  type SubscriptionRow,
  type SubscriptionFilters,
} from '@/api/subscriptions'
import { fetchAccount } from 'ethereum-identity-kit'
import {
  ALL_TIER_LABELS,
  SUBSCRIPTION_STATUSES,
  TIER_IDS,
  TIER_LABELS,
  type SubscriptionStatus,
  type TierId,
} from '@/lib/tiers'
import { resolveAddresses } from '@/lib/ens'
import { ConfirmModal } from '@/components/ConfirmModal'

const PAGE_SIZE = 50
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ENS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

type SortField = NonNullable<SubscriptionFilters['sort']>
type SortDir = NonNullable<SubscriptionFilters['dir']>

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function truncateAddress(address: string | null): string {
  if (!address) return '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysUntil(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (isNaN(ms)) return ''
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  if (days > 1) return `in ${days}d`
  if (days === 1) return `in 1d`
  if (days === 0) return `today`
  if (days === -1) return `1d ago`
  return `${-days}d ago`
}

function tierBadge(tierId: number) {
  const label = ALL_TIER_LABELS[tierId as keyof typeof ALL_TIER_LABELS] ?? `t${tierId}`
  const classes: Record<number, string> = {
    0: 'bg-tertiary text-neutral',
    1: 'bg-primary/15 text-primary',
    2: 'bg-amber-500/15 text-amber-400',
    3: 'bg-yellow-400/15 text-yellow-300',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classes[tierId] || 'bg-tertiary'}`}>
      {label}
    </span>
  )
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    active: 'bg-success/20 text-success',
    expired: 'bg-warning/20 text-warning',
    cancelled: 'bg-error/20 text-error',
    superseded: 'bg-tertiary text-neutral',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${classes[status] || 'bg-tertiary'}`}>
      {status}
    </span>
  )
}

function txLink(hash: string | null) {
  if (!hash) return <span className='text-neutral'>—</span>
  return (
    <a
      href={`https://etherscan.io/tx/${hash}`}
      target='_blank'
      rel='noopener noreferrer'
      className='text-primary font-mono text-xs hover:underline'
    >
      {hash.slice(0, 6)}…{hash.slice(-4)}
    </a>
  )
}

function ethFromWei(wei: string | null): string {
  if (!wei) return '—'
  try {
    const n = BigInt(wei)
    const denom = BigInt('1000000000000000000')
    const whole = n / denom
    const frac = n % denom
    if (frac === BigInt(0)) return `${whole.toString()} ETH`
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '')
    return fracStr ? `${whole.toString()}.${fracStr} ETH` : `${whole.toString()} ETH`
  } catch {
    return wei
  }
}

export default function SubscribersPage() {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTiers, setSelectedTiers] = useState<TierId[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<SubscriptionStatus[]>(['active'])
  const [sort, setSort] = useState<SortField>('started_at')
  const [dir, setDir] = useState<SortDir>('desc')

  const [ensNames, setEnsNames] = useState<Map<string, string | null>>(new Map())

  const [toCancel, setToCancel] = useState<SubscriptionRow | null>(null)
  const [toExtend, setToExtend] = useState<SubscriptionRow | null>(null)
  const [extendDate, setExtendDate] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // Grant subscription state
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantAddressInput, setGrantAddressInput] = useState('')
  const [grantResolvedAddress, setGrantResolvedAddress] = useState<string | null>(null)
  const [grantResolvedLabel, setGrantResolvedLabel] = useState<string | null>(null)
  const [grantResolving, setGrantResolving] = useState(false)
  const [grantTier, setGrantTier] = useState<TierId>(1)
  const [grantDate, setGrantDate] = useState(() => toDatetimeLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)))
  const [grantNotes, setGrantNotes] = useState('')
  const [grantError, setGrantError] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const filters: SubscriptionFilters = useMemo(
    () => ({
      search,
      tierIds: selectedTiers,
      statuses: selectedStatuses,
      sort,
      dir,
    }),
    [search, selectedTiers, selectedStatuses, sort, dir]
  )

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['subscriptions', page, filters],
    queryFn: () => fetchSubscriptions(page, PAGE_SIZE, filters),
    placeholderData: keepPreviousData,
  })

  const entries = useMemo(() => data?.data?.entries ?? [], [data?.data?.entries])
  const pagination = data?.data?.pagination

  useEffect(() => {
    const addresses = entries.map((e) => e.address).filter((a): a is string => !!a)
    if (addresses.length) resolveAddresses(addresses).then(setEnsNames)
  }, [entries])

  const toggleTier = (t: TierId) => {
    setSelectedTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort((a, b) => a - b) as TierId[]))
    setPage(1)
  }
  const toggleStatus = (s: SubscriptionStatus) => {
    setSelectedStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
    setPage(1)
  }

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(field)
      setDir('desc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return ''
    return dir === 'asc' ? ' ↑' : ' ↓'
  }

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelSubscription(id),
    onSuccess: (res, id) => {
      if (res.success) {
        setFlash({ kind: 'success', text: `Cancelled subscription #${id}.` })
        setToCancel(null)
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      } else {
        setActionError(res.error || 'Cancel failed')
      }
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Cancel failed'),
  })

  const extendMutation = useMutation({
    mutationFn: ({ id, expiresAt }: { id: number; expiresAt: string }) => extendSubscription(id, expiresAt),
    onSuccess: (res, vars) => {
      if (res.success) {
        setFlash({ kind: 'success', text: `Extended subscription #${vars.id} to ${formatDate(res.data?.expiresAt ?? vars.expiresAt)}.` })
        setToExtend(null)
        setExtendDate('')
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      } else {
        setActionError(res.error || 'Extend failed')
      }
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Extend failed'),
  })

  const grantMutation = useMutation({
    mutationFn: (payload: { address: string; tierId: TierId; expiresAt: string; notes?: string }) =>
      grantSubscription(payload),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setFlash({ kind: 'success', text: `Granted ${TIER_LABELS[grantTier]} subscription #${res.data.id}.` })
        setGrantOpen(false)
        setGrantAddressInput('')
        setGrantResolvedAddress(null)
        setGrantResolvedLabel(null)
        setGrantNotes('')
        setGrantError(null)
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      } else {
        setGrantError(res.error || 'Grant failed')
      }
    },
    onError: (err) => setGrantError(err instanceof Error ? err.message : 'Grant failed'),
  })

  const resolveGrantTarget = async () => {
    setGrantError(null)
    const raw = grantAddressInput.trim()
    if (!raw) return
    if (ADDRESS_RE.test(raw)) {
      const addr = raw.toLowerCase()
      setGrantResolvedAddress(addr)
      setGrantResolvedLabel(`${addr.slice(0, 6)}…${addr.slice(-4)}`)
      return
    }
    if (ENS_RE.test(raw)) {
      setGrantResolving(true)
      try {
        const account = await fetchAccount(raw)
        const resolved = account?.address?.toLowerCase()
        if (!resolved || !ADDRESS_RE.test(resolved)) {
          setGrantError(`Couldn't resolve ${raw}`)
          setGrantResolvedAddress(null)
          setGrantResolvedLabel(null)
        } else {
          setGrantResolvedAddress(resolved)
          setGrantResolvedLabel(raw)
        }
      } catch {
        setGrantError(`Couldn't resolve ${raw}`)
        setGrantResolvedAddress(null)
        setGrantResolvedLabel(null)
      } finally {
        setGrantResolving(false)
      }
      return
    }
    setGrantError('Enter an Ethereum address or ENS name')
    setGrantResolvedAddress(null)
    setGrantResolvedLabel(null)
  }

  const submitGrant = () => {
    setGrantError(null)
    if (!grantResolvedAddress) {
      setGrantError('Resolve an address or ENS name first')
      return
    }
    if (!grantDate) {
      setGrantError('Pick an expiration date')
      return
    }
    const expiresAt = new Date(grantDate)
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      setGrantError('Expiration must be in the future')
      return
    }
    grantMutation.mutate({
      address: grantResolvedAddress,
      tierId: grantTier,
      expiresAt: expiresAt.toISOString(),
      notes: grantNotes.trim() || undefined,
    })
  }

  const openExtend = (row: SubscriptionRow) => {
    setActionError(null)
    setToExtend(row)
    // Default to +30d from max(now, existing expires_at)
    const base = row.expires_at ? new Date(row.expires_at).getTime() : Date.now()
    const suggested = new Date(Math.max(base, Date.now()) + 30 * 24 * 60 * 60 * 1000)
    // HTML datetime-local expects YYYY-MM-DDTHH:mm in local time
    const pad = (n: number) => n.toString().padStart(2, '0')
    setExtendDate(
      `${suggested.getFullYear()}-${pad(suggested.getMonth() + 1)}-${pad(suggested.getDate())}T${pad(suggested.getHours())}:${pad(suggested.getMinutes())}`
    )
  }

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>Subscribers</h1>
          <p className='text-neutral mt-1 text-sm'>
            Manage Grails Pro subscriptions — search by address/user_id, filter by tier or status, and grant, cancel, or extend accounts.
          </p>
        </div>
        <button
          onClick={() => {
            setGrantOpen(true)
            setGrantError(null)
          }}
          className='btn btn-primary whitespace-nowrap'
        >
          Grant subscription
        </button>
      </div>

      {flash && (
        <div
          className={`mb-6 rounded-lg border p-4 text-sm ${
            flash.kind === 'success'
              ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
              : 'bg-error/10 border-error text-error'
          }`}
        >
          <div className='flex items-start justify-between gap-2'>
            <span>{flash.text}</span>
            <button
              type='button'
              onClick={() => setFlash(null)}
              className='text-neutral hover:text-foreground'
              aria-label='Dismiss'
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className='card mb-6'>
        <div className='flex flex-col gap-4'>
          <div>
            <label className='text-neutral mb-1 block text-xs'>Search</label>
            <input
              type='text'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Address (0x…) or user_id'
              className='w-full'
            />
          </div>
          <div className='flex flex-wrap gap-6'>
            <div>
              <div className='text-neutral mb-1 text-xs'>Tier</div>
              <div className='flex flex-wrap gap-3 text-sm'>
                {TIER_IDS.map((t) => (
                  <label key={t} className='flex items-center gap-1.5'>
                    <input
                      type='checkbox'
                      checked={selectedTiers.includes(t)}
                      onChange={() => toggleTier(t)}
                    />
                    {TIER_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className='text-neutral mb-1 text-xs'>Status</div>
              <div className='flex flex-wrap gap-3 text-sm'>
                {SUBSCRIPTION_STATUSES.map((s) => (
                  <label key={s} className='flex items-center gap-1.5 capitalize'>
                    <input
                      type='checkbox'
                      checked={selectedStatuses.includes(s)}
                      onChange={() => toggleStatus(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            {(selectedTiers.length > 0 || selectedStatuses.length !== 1 || selectedStatuses[0] !== 'active' || search) && (
              <div className='self-end'>
                <button
                  onClick={() => {
                    setSelectedTiers([])
                    setSelectedStatuses(['active'])
                    setSearchInput('')
                    setSearch('')
                    setPage(1)
                  }}
                  className='btn btn-secondary text-sm'
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className='bg-error/10 border-error mb-6 rounded-lg border p-4 text-sm'>
          <p className='text-error'>{(error as Error).message}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className='flex items-center justify-center py-12'>
          <div className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && entries.length === 0 && (
        <div className='card text-center py-12'>
          <h3 className='mb-2 text-lg font-semibold'>No subscriptions match the current filters</h3>
          <p className='text-neutral text-sm'>Try widening the status or tier filters.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && entries.length > 0 && (
        <>
          <div className='relative'>
            {isFetching && (
              <div
                className='absolute inset-0 z-10 flex items-center justify-center rounded-lg'
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
              >
                <div className='border-primary h-10 w-10 animate-spin rounded-full border-4 border-t-transparent' />
              </div>
            )}
            <div className='card overflow-hidden p-0'>
              <div className='overflow-x-auto'>
                <table className='min-w-[1100px] w-full text-sm'>
                  <thead className='bg-secondary sticky top-0'>
                    <tr>
                      <th className='px-3 py-2 text-left'>User</th>
                      <th
                        className='px-3 py-2 text-left cursor-pointer select-none'
                        onClick={() => toggleSort('tier_id')}
                      >
                        Tier{sortIndicator('tier_id')}
                      </th>
                      <th className='px-3 py-2 text-left'>Status</th>
                      <th
                        className='px-3 py-2 text-left cursor-pointer select-none'
                        onClick={() => toggleSort('started_at')}
                      >
                        Started{sortIndicator('started_at')}
                      </th>
                      <th
                        className='px-3 py-2 text-left cursor-pointer select-none'
                        onClick={() => toggleSort('expires_at')}
                      >
                        Expires{sortIndicator('expires_at')}
                      </th>
                      <th className='px-3 py-2 text-left'>Payment</th>
                      <th className='px-3 py-2 text-left hidden md:table-cell'>Amount</th>
                      <th className='px-3 py-2 text-left hidden lg:table-cell'>Tx</th>
                      <th className='px-3 py-2 text-left hidden xl:table-cell'>Granted by</th>
                      <th className='px-3 py-2 text-left'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row) => {
                      const ens = row.address ? ensNames.get(row.address.toLowerCase()) : null
                      return (
                        <tr key={row.id} className='border-t border-border'>
                          <td className='px-3 py-2'>
                            <div className='flex flex-col'>
                              {ens && <span className='text-sm'>{ens}</span>}
                              <span className='font-mono text-xs text-neutral' title={row.address ?? ''}>
                                {truncateAddress(row.address)}
                              </span>
                              <span className='text-neutral text-xs'>uid {row.user_id}</span>
                            </div>
                          </td>
                          <td className='px-3 py-2'>{tierBadge(row.tier_id)}</td>
                          <td className='px-3 py-2'>{statusBadge(row.status)}</td>
                          <td className='px-3 py-2'>
                            <div className='whitespace-nowrap text-xs'>{formatDate(row.started_at)}</div>
                          </td>
                          <td className='px-3 py-2'>
                            <div className='whitespace-nowrap text-xs'>{formatDate(row.expires_at)}</div>
                            {row.expires_at && (
                              <div className='text-neutral text-xs'>{daysUntil(row.expires_at)}</div>
                            )}
                          </td>
                          <td className='px-3 py-2 text-xs capitalize'>{row.payment_method || '—'}</td>
                          <td className='px-3 py-2 text-xs hidden md:table-cell'>{ethFromWei(row.payment_amount_wei)}</td>
                          <td className='px-3 py-2 hidden lg:table-cell'>{txLink(row.payment_tx_hash)}</td>
                          <td className='px-3 py-2 hidden xl:table-cell'>
                            <div className='flex flex-col text-xs'>
                              <span className='font-mono'>{truncateAddress(row.granted_by_address)}</span>
                              {row.granted_by_user_id != null && (
                                <span className='text-neutral'>uid {row.granted_by_user_id}</span>
                              )}
                            </div>
                          </td>
                          <td className='px-3 py-2'>
                            <div className='flex gap-1'>
                              <button
                                onClick={() => openExtend(row)}
                                disabled={row.status === 'cancelled' || row.status === 'superseded'}
                                className='btn btn-secondary text-xs disabled:opacity-40'
                              >
                                Extend…
                              </button>
                              <button
                                onClick={() => {
                                  setActionError(null)
                                  setToCancel(row)
                                }}
                                disabled={row.status !== 'active'}
                                className='btn btn-danger text-xs disabled:opacity-40'
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-neutral text-sm'>
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, pagination.totalEntries)} of{' '}
                {pagination.totalEntries.toLocaleString()}
              </p>
              <div className='flex gap-2'>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  className='btn btn-secondary text-sm disabled:opacity-50'
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages || isFetching}
                  className='btn btn-secondary text-sm disabled:opacity-50'
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel modal */}
      <ConfirmModal
        isOpen={!!toCancel}
        onClose={() => {
          if (!cancelMutation.isPending) {
            setToCancel(null)
            setActionError(null)
          }
        }}
        onConfirm={() => toCancel && cancelMutation.mutate(toCancel.id)}
        title='Cancel subscription?'
        variant='danger'
        confirmText='Cancel subscription'
        cancelText='Keep active'
        isLoading={cancelMutation.isPending}
        message={
          toCancel ? (
            <div className='space-y-2 text-left'>
              <div>
                Cancel subscription <b>#{toCancel.id}</b> for{' '}
                <span className='font-mono text-xs'>{truncateAddress(toCancel.address)}</span> (
                <b>{ALL_TIER_LABELS[toCancel.tier_id as keyof typeof ALL_TIER_LABELS] ?? toCancel.tier}</b>).
              </div>
              <div className='text-neutral text-xs'>
                If this row is the user&apos;s active subscription, their tier will be reset to free immediately.
              </div>
              {actionError && <div className='text-error text-xs'>{actionError}</div>}
            </div>
          ) : null
        }
      />

      {/* Grant modal */}
      {grantOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm'
            onClick={() => {
              if (!grantMutation.isPending) setGrantOpen(false)
            }}
          />
          <div className='card relative z-10 w-full max-w-md shadow-xl'>
            <h2 className='mb-4 text-lg font-semibold'>Grant subscription</h2>

            <div className='mb-4'>
              <label className='text-neutral mb-1 block text-xs'>Recipient address or ENS</label>
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={grantAddressInput}
                  onChange={(e) => {
                    setGrantAddressInput(e.target.value)
                    setGrantResolvedAddress(null)
                    setGrantResolvedLabel(null)
                    setGrantError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      resolveGrantTarget()
                    }
                  }}
                  placeholder='0x… or name.eth'
                  className='flex-1'
                  disabled={grantResolving || grantMutation.isPending}
                />
                <button
                  type='button'
                  onClick={resolveGrantTarget}
                  disabled={grantResolving || !grantAddressInput.trim() || grantMutation.isPending}
                  className='btn btn-secondary whitespace-nowrap'
                >
                  {grantResolving ? 'Resolving…' : 'Resolve'}
                </button>
              </div>
              {grantResolvedAddress && (
                <div className='text-neutral mt-2 text-xs'>
                  Sending to{' '}
                  <span className='font-mono'>{grantResolvedLabel}</span>
                  {grantResolvedLabel !== grantResolvedAddress && (
                    <span className='font-mono'> · {grantResolvedAddress.slice(0, 6)}…{grantResolvedAddress.slice(-4)}</span>
                  )}
                </div>
              )}
            </div>

            <div className='mb-4'>
              <div className='text-neutral mb-1 text-xs'>Tier</div>
              <div className='flex flex-wrap gap-4 text-sm'>
                {TIER_IDS.map((t) => (
                  <label key={t} className='flex items-center gap-2'>
                    <input
                      type='radio'
                      name='grantTier'
                      checked={grantTier === t}
                      onChange={() => setGrantTier(t)}
                    />
                    {TIER_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            <div className='mb-4'>
              <label className='text-neutral mb-1 block text-xs'>Expires</label>
              <input
                type='datetime-local'
                value={grantDate}
                onChange={(e) => setGrantDate(e.target.value)}
                className='w-full'
                disabled={grantMutation.isPending}
              />
            </div>

            <div className='mb-4'>
              <label className='text-neutral mb-1 block text-xs'>Notes (optional)</label>
              <textarea
                value={grantNotes}
                onChange={(e) => setGrantNotes(e.target.value)}
                rows={2}
                placeholder='Why this grant is being issued'
                className='w-full'
                maxLength={500}
                disabled={grantMutation.isPending}
              />
            </div>

            {grantError && <div className='text-error mb-3 text-xs'>{grantError}</div>}

            <div className='text-neutral mb-4 text-xs'>
              If the user currently has an active subscription, it will be marked <b>superseded</b> and replaced with this one.
            </div>

            <div className='flex gap-3'>
              <button
                onClick={() => {
                  if (!grantMutation.isPending) setGrantOpen(false)
                }}
                className='btn btn-secondary flex-1'
                disabled={grantMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={submitGrant}
                className='btn btn-primary flex-1'
                disabled={grantMutation.isPending || !grantResolvedAddress}
              >
                {grantMutation.isPending ? 'Granting…' : 'Grant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal */}
      {toExtend && (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm'
            onClick={() => {
              if (!extendMutation.isPending) {
                setToExtend(null)
                setActionError(null)
              }
            }}
          />
          <div className='card relative z-10 w-full max-w-md shadow-xl'>
            <h2 className='mb-4 text-lg font-semibold'>Extend subscription #{toExtend.id}</h2>
            <div className='text-neutral mb-3 text-sm'>
              User <span className='font-mono text-xs'>{truncateAddress(toExtend.address)}</span> (uid {toExtend.user_id}).
            </div>
            <div className='text-neutral mb-3 text-sm'>
              Currently expires: <b className='text-foreground'>{formatDate(toExtend.expires_at)}</b>
            </div>
            <label className='text-neutral mb-1 block text-xs'>New expiration</label>
            <input
              type='datetime-local'
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className='mb-4 w-full'
            />
            {actionError && <div className='text-error mb-3 text-xs'>{actionError}</div>}
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  if (!extendMutation.isPending) {
                    setToExtend(null)
                    setActionError(null)
                  }
                }}
                className='btn btn-secondary flex-1'
                disabled={extendMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!extendDate) {
                    setActionError('Pick a new expiration')
                    return
                  }
                  const expiresAt = new Date(extendDate).toISOString()
                  extendMutation.mutate({ id: toExtend.id, expiresAt })
                }}
                className='btn btn-primary flex-1'
                disabled={extendMutation.isPending || !extendDate}
              >
                {extendMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
