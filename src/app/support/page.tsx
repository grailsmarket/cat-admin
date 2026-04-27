'use client'

import Link from 'next/link'
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listSupportTickets, type SupportTicketStatus } from '@/api/support'

const PAGE_SIZE = 50

const STATUS_OPTIONS: SupportTicketStatus[] = ['open', 'closed', 'fixed']

function statusBadge(status: SupportTicketStatus) {
  const classes: Record<SupportTicketStatus, string> = {
    open: 'bg-primary/15 text-primary',
    closed: 'bg-tertiary text-neutral',
    fixed: 'bg-success/20 text-success',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${classes[status]}`}>
      {status}
    </span>
  )
}

function truncateAddress(address: string | null): string {
  if (!address) return '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
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

export default function SupportListPage() {
  const [status, setStatus] = useState<SupportTicketStatus | 'all'>('open')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support-tickets', { status, search, page }],
    queryFn: () =>
      listSupportTickets({
        status: status === 'all' ? undefined : status,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const tickets = data?.success && data.data ? data.data.tickets : []
  const pagination = data?.success && data.data ? data.data.pagination : null

  return (
    <div className='flex flex-col gap-6'>
      <header className='flex items-end justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold'>Support</h1>
          <p className='text-neutral text-sm'>Triage and reply to user-submitted tickets.</p>
        </div>
      </header>

      <section className='border-border bg-secondary flex flex-col gap-3 rounded-lg border p-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col gap-1'>
            <label className='text-neutral text-xs'>Status</label>
            <div className='flex gap-1'>
              {(['all', ...STATUS_OPTIONS] as const).map((s) => (
                <button
                  key={s}
                  type='button'
                  onClick={() => {
                    setStatus(s)
                    setPage(1)
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                    status === s
                      ? 'bg-primary text-background font-semibold'
                      : 'bg-tertiary text-neutral hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(searchInput.trim())
              setPage(1)
            }}
            className='flex flex-1 flex-col gap-1'
          >
            <label className='text-neutral text-xs'>Search subject</label>
            <input
              type='text'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Subject contains…'
              className='w-full'
            />
          </form>
        </div>
      </section>

      <section className='border-border bg-secondary overflow-hidden rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='border-border bg-tertiary border-b'>
            <tr>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>Subject</th>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>User</th>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>Status</th>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>Messages</th>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>Updated</th>
              <th className='text-neutral px-4 py-2 text-left text-xs font-medium uppercase'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className='text-neutral px-4 py-8 text-center'>
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && isError && (
              <tr>
                <td colSpan={6} className='text-error px-4 py-8 text-center'>
                  Failed to load tickets.
                </td>
              </tr>
            )}
            {!isLoading && !isError && tickets.length === 0 && (
              <tr>
                <td colSpan={6} className='text-neutral px-4 py-8 text-center'>
                  No tickets match these filters.
                </td>
              </tr>
            )}
            {tickets.map((ticket) => (
              <tr key={ticket.id} className='border-border hover:bg-tertiary/40 border-b last:border-b-0'>
                <td className='px-4 py-3'>
                  <Link href={`/support/${ticket.id}`} className='text-foreground hover:text-primary font-medium'>
                    {ticket.subject}
                  </Link>
                </td>
                <td className='px-4 py-3'>
                  <span className='text-neutral font-mono text-xs'>{truncateAddress(ticket.userAddress)}</span>
                </td>
                <td className='px-4 py-3'>{statusBadge(ticket.status)}</td>
                <td className='text-neutral px-4 py-3'>{ticket.messageCount ?? '—'}</td>
                <td className='text-neutral px-4 py-3'>{formatDate(ticket.updatedAt)}</td>
                <td className='px-4 py-3'>
                  <Link href={`/support/${ticket.id}`} className='btn btn-secondary'>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-neutral text-sm'>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </p>
          <div className='flex gap-2'>
            <button
              type='button'
              className='btn btn-secondary'
              disabled={!pagination.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type='button'
              className='btn btn-secondary'
              disabled={!pagination.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
