'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MAX_RESOLVED_REASON_LENGTH,
  getErrorMessage,
  listCompromisedNames,
  listIncidents,
  updateCompromisedName,
  type CompromisedName,
  type CompromisedStatus,
} from '@/api/compromised-names'
import { ConfirmModal } from '@/components/ConfirmModal'
import { EditCompromisedModal, FlagNameModal } from '@/components/CompromisedNameForms'

const PAGE_SIZE = 50
const STATUS_OPTIONS = ['active', 'resolved', 'all'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`https://etherscan.io/address/${address}`}
      target='_blank'
      rel='noopener noreferrer'
      title={address}
      className='text-primary font-mono hover:underline'
    >
      {shortAddress(address)}
    </a>
  )
}

// Where the name sits now relative to who is allowed to hold it
function ownerState(item: CompromisedName): 'owner' | 'taker' | 'other' | 'unknown' {
  const current = item.current_owner?.toLowerCase()
  if (!current) return 'unknown'
  if (current === item.original_owner || item.allowed_addresses.includes(current)) return 'owner'
  if (current === item.taken_by) return 'taker'
  return 'other'
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className='card'>
      <p className='text-neutral text-sm font-medium'>{label}</p>
      {value === undefined ? (
        <div className='bg-tertiary mt-1 h-8 w-16 animate-pulse rounded' />
      ) : (
        <p className='mt-1 text-3xl font-bold'>{value.toLocaleString()}</p>
      )}
    </div>
  )
}

// useSearchParams needs a Suspense boundary for prerendering
export default function CompromisedNamesPage() {
  return (
    <Suspense>
      <CompromisedNamesContent />
    </Suspense>
  )
}

function CompromisedNamesContent() {
  // ?q= prefills the search (linked from the Name Lookup page)
  const initialQ = useSearchParams().get('q')?.trim() ?? ''
  const [q, setQ] = useState(initialQ)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [incident, setIncident] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<{
    q?: string
    status?: CompromisedStatus
    incident?: string
  }>({ status: 'active', q: initialQ || undefined })
  const [page, setPage] = useState(1)

  const [showFlagModal, setShowFlagModal] = useState(false)
  const [editing, setEditing] = useState<CompromisedName | null>(null)
  const [statusChange, setStatusChange] = useState<CompromisedName | null>(null)
  const [resolveReason, setResolveReason] = useState('')

  const { data: incidentsData } = useQuery({
    queryKey: ['admin', 'compromised-incidents'],
    queryFn: listIncidents,
  })
  const incidents = incidentsData?.data?.incidents ?? []

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'compromised-names', appliedFilters, page],
    queryFn: () => listCompromisedNames({ ...appliedFilters, page, limit: PAGE_SIZE }),
  })

  // Totals per status (limit=1, read from pagination.total)
  const { data: activeCount, refetch: refetchActiveCount } = useQuery({
    queryKey: ['admin', 'compromised-names', 'count', 'active'],
    queryFn: () => listCompromisedNames({ status: 'active', limit: 1 }),
  })
  const { data: resolvedCount, refetch: refetchResolvedCount } = useQuery({
    queryKey: ['admin', 'compromised-names', 'count', 'resolved'],
    queryFn: () => listCompromisedNames({ status: 'resolved', limit: 1 }),
  })

  const refreshAll = () => {
    refetch()
    refetchActiveCount()
    refetchResolvedCount()
  }

  const statusMutation = useMutation({
    mutationFn: ({ item, reason }: { item: CompromisedName; reason?: string }) =>
      updateCompromisedName(
        item.id,
        item.status === 'active' ? { status: 'resolved', resolvedReason: reason } : { status: 'active' }
      ),
    onSuccess: (result, { item }) => {
      if (!result.success) {
        toast.error(getErrorMessage(result.error, 'Failed to update status'))
        return
      }
      toast.success(item.status === 'active' ? `Resolved ${item.name}` : `Re-activated ${item.name}`)
      setStatusChange(null)
      setResolveReason('')
      refreshAll()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const apply = () => {
    setAppliedFilters({
      q: q.trim() || undefined,
      status: status === 'all' ? undefined : status,
      incident: incident || undefined,
    })
    setPage(1)
  }

  const reset = () => {
    setQ('')
    setStatus('active')
    setIncident('')
    setAppliedFilters({ status: 'active' })
    setPage(1)
  }

  const names = data?.data?.names ?? []
  const pagination = data?.data?.pagination
  const loadError = data && !data.success ? getErrorMessage(data.error, 'Failed to load compromised names') : null
  const incidentTitle = (slug: string) => incidents.find((i) => i.slug === slug)?.title ?? slug

  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>Compromised Names</h1>
          <p className='text-neutral text-sm'>
            Names flagged as stolen. Only the original owner or a recovery wallet can buy or accept offers on an
            active flag.
          </p>
        </div>
        <div className='flex gap-2'>
          <button onClick={refreshAll} disabled={isFetching} className='btn btn-secondary'>
            Refresh
          </button>
          <button onClick={() => setShowFlagModal(true)} className='btn btn-primary'>
            Flag a name
          </button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <StatCard label='Active flags' value={activeCount?.data?.pagination.total} />
        <StatCard label='Resolved' value={resolvedCount?.data?.pagination.total} />
        <StatCard label='Incidents' value={incidentsData ? incidents.length : undefined} />
      </div>

      <div className='card grid grid-cols-1 gap-3 md:grid-cols-6'>
        <input
          type='text'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          placeholder='Name, or 0x address (owner / taker / recovery wallet)'
          className='w-full md:col-span-3'
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className='w-full'>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={incident} onChange={(e) => setIncident(e.target.value)} className='w-full'>
          <option value=''>All incidents</option>
          {incidents.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.title}
            </option>
          ))}
        </select>
        <div className='flex gap-2'>
          <button onClick={apply} className='btn btn-primary flex-1'>
            Apply
          </button>
          <button onClick={reset} className='btn btn-secondary flex-1'>
            Reset
          </button>
        </div>
      </div>

      <div className='card overflow-x-auto p-0'>
        <table className='w-full'>
          <thead className='border-border border-b'>
            <tr className='text-neutral text-left text-xs'>
              <th className='px-4 py-3'>Name</th>
              <th className='px-4 py-3'>Incident</th>
              <th className='px-4 py-3'>Original owner</th>
              <th className='px-4 py-3'>Current owner</th>
              <th className='px-4 py-3'>Taken</th>
              <th className='px-4 py-3'>Listings</th>
              <th className='px-4 py-3'>Status</th>
              <th className='px-4 py-3 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className='text-neutral px-4 py-8 text-center'>
                  Loading…
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={8} className='text-error px-4 py-8 text-center'>
                  {loadError}
                </td>
              </tr>
            ) : names.length === 0 ? (
              <tr>
                <td colSpan={8} className='text-neutral px-4 py-8 text-center'>
                  No compromised names match the filters.
                </td>
              </tr>
            ) : (
              names.map((item) => {
                const state = ownerState(item)
                const listings = Number(item.active_listings) || 0

                return (
                  <tr key={item.id} className='border-border border-b align-top last:border-b-0'>
                    <td className='px-4 py-3 text-sm'>
                      <Link
                        href={`/names/${encodeURIComponent(item.name)}`}
                        className='text-primary font-medium hover:underline'
                      >
                        {item.name}
                      </Link>
                      {item.notes && (
                        <p className='text-neutral mt-1 max-w-xs truncate text-xs' title={item.notes}>
                          {item.notes}
                        </p>
                      )}
                    </td>
                    <td className='px-4 py-3 text-xs'>{incidentTitle(item.incident_slug)}</td>
                    <td className='px-4 py-3 text-xs'>
                      <AddressLink address={item.original_owner} />
                      {item.allowed_addresses.length > 0 && (
                        <p
                          className='text-neutral mt-1'
                          title={item.allowed_addresses.join('\n')}
                        >
                          +{item.allowed_addresses.length} recovery wallet
                          {item.allowed_addresses.length === 1 ? '' : 's'}
                        </p>
                      )}
                    </td>
                    <td className='px-4 py-3 text-xs'>
                      {item.current_owner ? <AddressLink address={item.current_owner} /> : '—'}
                      {state === 'owner' && <p className='text-success mt-1'>with owner</p>}
                      {state === 'taker' && <p className='text-error mt-1'>still with taker</p>}
                      {state === 'other' && <p className='mt-1 text-amber-500'>third party</p>}
                    </td>
                    <td className='px-4 py-3 text-xs whitespace-nowrap'>
                      {item.taken_by ? <AddressLink address={item.taken_by} /> : <span className='text-neutral'>—</span>}
                      <p className='text-neutral mt-1'>
                        {item.taken_at ? new Date(item.taken_at).toLocaleString() : 'unknown time'}
                      </p>
                      {item.taken_tx_hash && (
                        <a
                          href={`https://etherscan.io/tx/${item.taken_tx_hash}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'
                        >
                          tx ↗
                        </a>
                      )}
                    </td>
                    <td className='px-4 py-3 text-xs'>
                      {listings > 0 ? (
                        <span className='rounded bg-amber-600/20 px-1.5 py-0.5 text-amber-400'>
                          {listings} active
                        </span>
                      ) : (
                        <span className='text-neutral'>—</span>
                      )}
                    </td>
                    <td className='px-4 py-3 text-xs'>
                      <span className={item.status === 'active' ? 'text-error' : 'text-success'}>
                        {item.status}
                      </span>
                      {item.resolved_reason && <p className='text-neutral mt-1'>{item.resolved_reason}</p>}
                    </td>
                    <td className='px-4 py-3 text-right text-sm whitespace-nowrap'>
                      <button onClick={() => setEditing(item)} className='text-primary mr-3 hover:underline'>
                        Edit
                      </button>
                      <button
                        onClick={() => setStatusChange(item)}
                        className={item.status === 'active' ? 'text-success hover:underline' : 'text-error hover:underline'}
                      >
                        {item.status === 'active' ? 'Resolve' : 'Re-activate'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between text-sm'>
          <p className='text-neutral'>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} names
          </p>
          <div className='flex gap-2'>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!pagination.hasPrev || isFetching}
              className='btn btn-secondary'
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasNext || isFetching}
              className='btn btn-secondary'
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showFlagModal && (
        <FlagNameModal
          incidents={incidents}
          onClose={() => setShowFlagModal(false)}
          onSaved={() => {
            setShowFlagModal(false)
            refreshAll()
          }}
        />
      )}

      {editing && (
        <EditCompromisedModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refreshAll()
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!statusChange}
        onClose={() => {
          setStatusChange(null)
          setResolveReason('')
        }}
        onConfirm={() => {
          if (!statusChange) return
          statusMutation.mutate({ item: statusChange, reason: resolveReason.trim() || undefined })
        }}
        isLoading={statusMutation.isPending}
        variant={statusChange?.status === 'active' ? 'default' : 'warning'}
        title={statusChange?.status === 'active' ? `Resolve ${statusChange.name}?` : `Re-activate ${statusChange?.name}?`}
        confirmText={statusChange?.status === 'active' ? 'Resolve' : 'Re-activate'}
        message={
          statusChange?.status === 'active' ? (
            <div className='space-y-3 text-left'>
              <p>
                The warning and trading restrictions will be lifted, and listings and offers on this name will be
                usable by anyone again.
              </p>
              <div>
                <label className='text-neutral mb-1 block text-xs'>Reason (optional, defaults to “manual”)</label>
                <input
                  type='text'
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  maxLength={MAX_RESOLVED_REASON_LENGTH}
                  className='w-full'
                  placeholder='e.g. returned_off_platform'
                />
              </div>
            </div>
          ) : (
            <p>
              The name will be flagged as stolen again: warnings return, and only the original owner or recovery
              wallets can buy it or have offers accepted.
            </p>
          )
        }
      />
    </div>
  )
}
