'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listGlobalMessages,
  deleteGlobalMessage,
  banUserFromGlobalChat,
  unbanUserFromGlobalChat,
  type AdminGlobalMessage,
} from '@/api/global-chat'
import { banUserFromChat } from '@/api/chat-moderation'
import { ConfirmModal } from '@/components/ConfirmModal'

const STATUS_OPTIONS = ['all', 'visible', 'deleted'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]
type BanScope = 'global' | 'all'

const PAGE_LIMIT = 50

export default function GlobalChatPage() {
  const [sender, setSender] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const [appliedFilters, setAppliedFilters] = useState<{
    sender?: string
    status?: StatusFilter
    from?: string
    to?: string
  }>({})

  const [confirmDelete, setConfirmDelete] = useState<AdminGlobalMessage | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [confirmBan, setConfirmBan] = useState<AdminGlobalMessage | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banScope, setBanScope] = useState<BanScope>('global')
  const [confirmUnbanGlobal, setConfirmUnbanGlobal] = useState<AdminGlobalMessage | null>(null)
  const [unbanReason, setUnbanReason] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'global-chat', 'messages', appliedFilters, page],
    queryFn: () =>
      listGlobalMessages({
        ...appliedFilters,
        page,
        limit: PAGE_LIMIT,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteGlobalMessage(id, reason),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.message ?? 'Failed to delete')
        return
      }
      toast.success('Message deleted')
      setConfirmDelete(null)
      setDeleteReason('')
      refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const banMutation = useMutation({
    mutationFn: ({ userId, reason, scope }: { userId: number; reason: string; scope: BanScope }) =>
      scope === 'global' ? banUserFromGlobalChat(userId, reason) : banUserFromChat(userId, reason),
    onSuccess: (result, { scope }) => {
      if (!result.success) {
        toast.error(result.error?.message ?? 'Failed to ban user')
        return
      }
      toast.success(scope === 'global' ? 'User banned from global chat' : 'User banned from all chats')
      setConfirmBan(null)
      setBanReason('')
      refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unbanGlobalMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) =>
      unbanUserFromGlobalChat(userId, reason),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.message ?? 'Failed to unban user')
        return
      }
      toast.success('User unbanned from global chat')
      setConfirmUnbanGlobal(null)
      setUnbanReason('')
      refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const apply = () => {
    setPage(1)
    setAppliedFilters({
      sender: sender.trim() || undefined,
      status,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    })
  }

  const reset = () => {
    setSender('')
    setStatus('all')
    setFrom('')
    setTo('')
    setPage(1)
    setAppliedFilters({})
  }

  const messages = data?.data?.messages ?? []
  const pagination = data?.data?.pagination

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>Global Chat Moderation</h1>
          <p className='text-neutral text-sm'>
            {pagination
              ? `${pagination.total} message${pagination.total === 1 ? '' : 's'} matching filters`
              : 'Moderate the global chat'}
          </p>
        </div>
        <div className='flex gap-2'>
          <Link href='/global-chat/settings' className='btn btn-secondary'>
            Settings
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className='btn btn-secondary'
          >
            Refresh
          </button>
        </div>
      </div>

      <div className='card grid grid-cols-1 gap-3 md:grid-cols-5'>
        <input
          type='text'
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder='Sender (0x… or user id)'
          className='w-full md:col-span-4'
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className='w-full'
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className='md:col-span-2'>
          <label className='text-neutral mb-1 block text-xs'>From</label>
          <input
            type='datetime-local'
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className='w-full'
          />
        </div>
        <div className='md:col-span-2'>
          <label className='text-neutral mb-1 block text-xs'>To</label>
          <input
            type='datetime-local'
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className='w-full'
          />
        </div>
        <div className='flex items-end gap-2'>
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
              <th className='px-4 py-3'>Time</th>
              <th className='px-4 py-3'>Sender</th>
              <th className='px-4 py-3'>Message</th>
              <th className='px-4 py-3'>Status</th>
              <th className='px-4 py-3 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className='text-neutral px-4 py-8 text-center'>
                  Loading…
                </td>
              </tr>
            ) : messages.length === 0 ? (
              <tr>
                <td colSpan={5} className='text-neutral px-4 py-8 text-center'>
                  No messages match the filters.
                </td>
              </tr>
            ) : (
              messages.map((m) => (
                <tr key={m.id} className='border-border border-b last:border-b-0'>
                  <td className='text-neutral px-4 py-3 text-xs whitespace-nowrap'>
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className='px-4 py-3 font-mono text-xs whitespace-nowrap'>
                    <Link
                      href={`/chat-moderation/users/${m.sender_user_id}`}
                      className='text-primary hover:underline'
                    >
                      {`${m.sender_address.slice(0, 8)}…${m.sender_address.slice(-4)}`}
                    </Link>
                    {m.sender_mod_status === 'banned' && (
                      <span className='bg-error/20 text-error ml-2 inline-block rounded px-1.5 py-0.5 text-[10px]'>
                        banned
                      </span>
                    )}
                    {m.sender_global_status === 'banned' && (
                      <span className='ml-2 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-500'>
                        global ban
                      </span>
                    )}
                  </td>
                  <td
                    className={`max-w-md truncate px-4 py-3 text-sm ${
                      m.deleted_at ? 'text-neutral line-through' : ''
                    }`}
                  >
                    {m.body}
                  </td>
                  <td className='px-4 py-3 text-xs'>
                    <span className={m.deleted_at ? 'text-error' : 'text-success'}>
                      {m.deleted_at ? 'deleted' : 'visible'}
                    </span>
                    {m.deleted_at && (
                      <span
                        className='text-neutral ml-1'
                        title={m.deleted_reason ?? undefined}
                      >
                        {m.deleted_by_admin ? 'by Admin' : 'by user'}
                      </span>
                    )}
                  </td>
                  <td className='px-4 py-3 text-right whitespace-nowrap'>
                    {!m.deleted_at && (
                      <button
                        onClick={() => setConfirmDelete(m)}
                        className='text-error hover:underline'
                      >
                        Delete
                      </button>
                    )}
                    {m.sender_mod_status !== 'banned' && (
                      <button
                        onClick={() => {
                          // Default to global-only; if already global-banned the
                          // only remaining escalation is an all-chats ban.
                          setBanScope(m.sender_global_status === 'banned' ? 'all' : 'global')
                          setConfirmBan(m)
                        }}
                        className='ml-3 text-amber-500 hover:underline'
                      >
                        Ban sender
                      </button>
                    )}
                    {m.sender_global_status === 'banned' && (
                      <button
                        onClick={() => setConfirmUnbanGlobal(m)}
                        className='text-success ml-3 hover:underline'
                      >
                        Unban (global)
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className='flex items-center justify-between'>
          <p className='text-neutral text-sm'>
            Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{' '}
            {pagination.total} total
          </p>
          <div className='flex gap-2'>
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={!pagination.hasPrev || isFetching}
              className='btn btn-secondary'
            >
              Prev
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

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => {
          setConfirmDelete(null)
          setDeleteReason('')
        }}
        onConfirm={() => {
          if (!confirmDelete) return
          if (!deleteReason.trim()) {
            toast.error('Reason is required')
            return
          }
          deleteMutation.mutate({ id: confirmDelete.id, reason: deleteReason.trim() })
        }}
        isLoading={deleteMutation.isPending}
        variant='danger'
        title='Delete message?'
        confirmText='Delete'
        message={
          <div className='space-y-3 text-left'>
            <p>This will soft-delete the message from the global chat.</p>
            {confirmDelete && (
              <div className='bg-tertiary rounded p-2 text-xs'>{confirmDelete.body}</div>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className='w-full'
                rows={3}
                placeholder='Why is this being deleted?'
              />
            </div>
          </div>
        }
      />

      <ConfirmModal
        isOpen={!!confirmBan}
        onClose={() => {
          setConfirmBan(null)
          setBanReason('')
        }}
        onConfirm={() => {
          if (!confirmBan) return
          if (!banReason.trim()) {
            toast.error('Reason is required')
            return
          }
          banMutation.mutate({
            userId: confirmBan.sender_user_id,
            reason: banReason.trim(),
            scope: banScope,
          })
        }}
        isLoading={banMutation.isPending}
        variant='danger'
        title='Ban sender?'
        confirmText='Ban'
        message={
          <div className='space-y-3 text-left'>
            <p>
              {banScope === 'global'
                ? 'This bans the user from the global chat only (messages and reactions). Direct messages are unaffected.'
                : 'This bans the user from all chats — direct messages and global chat.'}{' '}
              Their existing messages are not deleted automatically.
            </p>
            {confirmBan && (
              <div className='bg-tertiary rounded p-2 font-mono text-xs'>
                {confirmBan.sender_address}
              </div>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Scope</label>
              <div className='space-y-1'>
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='radio'
                    name='ban-scope'
                    checked={banScope === 'global'}
                    onChange={() => setBanScope('global')}
                    disabled={confirmBan?.sender_global_status === 'banned'}
                  />
                  Global chat only
                  {confirmBan?.sender_global_status === 'banned' && (
                    <span className='text-neutral text-xs'>(already applied)</span>
                  )}
                </label>
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='radio'
                    name='ban-scope'
                    checked={banScope === 'all'}
                    onChange={() => setBanScope('all')}
                  />
                  All chats (DMs + global)
                </label>
              </div>
            </div>
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason</label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className='w-full'
                rows={3}
                placeholder='Why is this user being banned?'
              />
            </div>
          </div>
        }
      />

      <ConfirmModal
        isOpen={!!confirmUnbanGlobal}
        onClose={() => {
          setConfirmUnbanGlobal(null)
          setUnbanReason('')
        }}
        onConfirm={() => {
          if (!confirmUnbanGlobal) return
          unbanGlobalMutation.mutate({
            userId: confirmUnbanGlobal.sender_user_id,
            reason: unbanReason.trim(),
          })
        }}
        isLoading={unbanGlobalMutation.isPending}
        variant='warning'
        title='Unban from global chat?'
        confirmText='Unban'
        message={
          <div className='space-y-3 text-left'>
            <p>
              This lifts the global-chat-only ban. An all-chats ban, if present,
              stays in place.
            </p>
            {confirmUnbanGlobal && (
              <div className='bg-tertiary rounded p-2 font-mono text-xs'>
                {confirmUnbanGlobal.sender_address}
              </div>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason (optional)</label>
              <textarea
                value={unbanReason}
                onChange={(e) => setUnbanReason(e.target.value)}
                className='w-full'
                rows={2}
                placeholder='Why is this ban being lifted?'
              />
            </div>
          </div>
        }
      />
    </div>
  )
}
