'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSupportTicket,
  postAdminReply,
  updateTicketStatus,
  type SupportTicketStatus,
} from '@/api/support'
import { ConfirmModal } from '@/components/ConfirmModal'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateAddress(address: string | null): string {
  if (!address) return '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export default function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const ticketId = parseInt(id)
  const queryClient = useQueryClient()
  const [reply, setReply] = useState('')
  const [pendingStatus, setPendingStatus] = useState<SupportTicketStatus | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => getSupportTicket(ticketId),
    enabled: !isNaN(ticketId),
  })

  const replyMutation = useMutation({
    mutationFn: (body: string) => postAdminReply(ticketId, body),
    onSuccess: (res) => {
      if (res.success) {
        setReply('')
        setFlash({ kind: 'success', text: 'Reply posted.' })
        queryClient.invalidateQueries({ queryKey: ['support-ticket', ticketId] })
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      } else {
        setFlash({ kind: 'error', text: typeof res.error === 'string' ? res.error : 'Failed to post reply.' })
      }
    },
    onError: () => setFlash({ kind: 'error', text: 'Failed to post reply.' }),
  })

  const statusMutation = useMutation({
    mutationFn: (status: SupportTicketStatus) => updateTicketStatus(ticketId, status),
    onSuccess: (res, status) => {
      if (res.success) {
        setPendingStatus(null)
        setFlash({ kind: 'success', text: `Ticket marked ${status}.` })
        queryClient.invalidateQueries({ queryKey: ['support-ticket', ticketId] })
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      } else {
        setFlash({ kind: 'error', text: typeof res.error === 'string' ? res.error : 'Failed to update status.' })
      }
    },
    onError: () => setFlash({ kind: 'error', text: 'Failed to update status.' }),
  })

  if (isNaN(ticketId)) {
    return <p className='text-error'>Invalid ticket id.</p>
  }
  if (isLoading) {
    return <p className='text-neutral'>Loading ticket…</p>
  }
  if (isError || !data?.success || !data.data) {
    return (
      <div className='flex flex-col gap-3'>
        <p className='text-error'>Ticket not found.</p>
        <Link href='/support' className='btn btn-secondary w-fit'>
          Back to tickets
        </Link>
      </div>
    )
  }

  const { ticket, messages, statusChanges = [] } = data.data

  return (
    <div className='flex flex-col gap-6 p-4 lg:p-8'>
      <header className='flex flex-col gap-3'>
        <Link href='/support' className='text-neutral hover:text-foreground text-sm'>
          ← Back to tickets
        </Link>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold'>{ticket.subject}</h1>
            <p className='text-neutral mt-1 text-sm'>
              Opened {formatDate(ticket.createdAt)} by{' '}
              <span className='font-mono'>{truncateAddress(ticket.userAddress)}</span>
            </p>
          </div>
          {statusBadge(ticket.status)}
        </div>

        {ticket.urls.length > 0 && (
          <div className='flex flex-col gap-1'>
            <p className='text-neutral text-xs uppercase'>Linked URLs</p>
            <ul className='flex flex-col gap-0.5'>
              {ticket.urls.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary hover:underline'
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {flash && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            flash.kind === 'success' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
          }`}
        >
          {flash.text}
        </div>
      )}

      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-semibold'>Conversation</h2>
        <ul className='flex flex-col gap-2'>
          {messages.map((m) => (
            <li
              key={m.id}
              className={`border-border flex flex-col gap-2 rounded-md border p-4 ${
                m.authorRole === 'admin' ? 'bg-primary/5 border-primary/30' : 'bg-secondary'
              }`}
            >
              <div className='flex items-center justify-between text-xs'>
                <span className={`font-semibold ${m.authorRole === 'admin' ? 'text-primary' : 'text-foreground'}`}>
                  {m.authorRole === 'admin' ? 'Admin' : 'User'}
                  <span className='text-neutral ml-2 font-mono'>{truncateAddress(m.authorAddress)}</span>
                </span>
                <span className='text-neutral'>{formatDate(m.createdAt)}</span>
              </div>
              <p className='text-foreground text-sm whitespace-pre-wrap break-words'>{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className='border-border bg-secondary flex flex-col gap-3 rounded-lg border p-4'>
        <h2 className='text-lg font-semibold'>Reply</h2>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder='Write a reply to the user…'
          className='w-full'
          maxLength={10_000}
          disabled={replyMutation.isPending}
        />
        <div className='flex items-center justify-end gap-2'>
          <button
            type='button'
            className='btn btn-primary'
            disabled={replyMutation.isPending || !reply.trim()}
            onClick={() => replyMutation.mutate(reply.trim())}
          >
            {replyMutation.isPending ? 'Posting…' : 'Post reply'}
          </button>
        </div>
      </section>

      {statusChanges.length > 0 && (
        <section className='border-border bg-secondary flex flex-col gap-3 rounded-lg border p-4'>
          <h2 className='text-lg font-semibold'>Status history</h2>
          <ul className='flex flex-col gap-1.5 text-sm'>
            {statusChanges.map((c) => (
              <li key={c.id} className='flex flex-wrap items-center gap-2'>
                <span className='text-neutral'>{formatDate(c.createdAt)}</span>
                <span className='text-foreground'>
                  {c.fromStatus ? (
                    <>
                      <span className='capitalize'>{c.fromStatus}</span>
                      <span className='text-neutral mx-1'>→</span>
                    </>
                  ) : null}
                  <span className='capitalize font-semibold'>{c.toStatus}</span>
                </span>
                <span className='text-neutral'>by</span>
                <span
                  className={`font-mono ${c.actorRole === 'admin' ? 'text-primary' : 'text-foreground'}`}
                >
                  {truncateAddress(c.actorAddress)}
                </span>
                <span className='text-neutral text-xs uppercase'>({c.actorRole})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className='border-border bg-secondary flex flex-col gap-3 rounded-lg border p-4'>
        <h2 className='text-lg font-semibold'>Update status</h2>
        <p className='text-neutral text-sm'>Current status: <strong>{ticket.status}</strong></p>
        <div className='flex flex-wrap gap-2'>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type='button'
              className={`btn ${ticket.status === s ? 'btn-primary' : 'btn-secondary'} capitalize`}
              disabled={ticket.status === s || statusMutation.isPending}
              onClick={() => setPendingStatus(s)}
            >
              Mark {s}
            </button>
          ))}
        </div>
      </section>

      <ConfirmModal
        isOpen={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => pendingStatus && statusMutation.mutate(pendingStatus)}
        title={`Mark ticket ${pendingStatus ?? ''}?`}
        message={`The user will receive a notification that this ticket has been marked ${pendingStatus}.`}
        confirmText={pendingStatus ? `Mark ${pendingStatus}` : 'Confirm'}
        variant={pendingStatus === 'closed' ? 'warning' : 'default'}
        isLoading={statusMutation.isPending}
      />
    </div>
  )
}
