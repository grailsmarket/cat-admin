'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getChatModInfo,
  banUserFromChat,
  unbanUserFromChat,
  deleteUserChatMessages,
  type ChatModInfo,
} from '@/api/chat-moderation'
import { ConfirmModal } from '@/components/ConfirmModal'

type ConfirmAction = 'ban' | 'unban' | 'delete-messages' | null

export default function ChatUserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId: userIdStr } = use(params)
  const userId = parseInt(userIdStr, 10)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'chat-moderation', 'user', userId],
    queryFn: () => getChatModInfo(userId),
    enabled: Number.isFinite(userId),
  })

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [reason, setReason] = useState('')

  const onActionSuccess = (msg: string) => () => {
    toast.success(msg)
    setConfirmAction(null)
    setReason('')
    refetch()
  }

  const banMutation = useMutation({
    mutationFn: () => banUserFromChat(userId, reason),
    onSuccess: (r) => {
      if (!r.success) return toast.error(r.error?.message ?? 'Failed')
      onActionSuccess('User banned from messaging')()
    },
  })

  const unbanMutation = useMutation({
    mutationFn: () => unbanUserFromChat(userId, reason),
    onSuccess: (r) => {
      if (!r.success) return toast.error(r.error?.message ?? 'Failed')
      onActionSuccess('User restored')()
    },
  })

  const deleteMessagesMutation = useMutation({
    mutationFn: () => deleteUserChatMessages(userId, reason),
    onSuccess: (r) => {
      if (!r.success) return toast.error(r.error?.message ?? 'Failed')
      const count = (r.data as { deletedCount?: number } | undefined)?.deletedCount ?? 0
      onActionSuccess(`Deleted ${count} message${count === 1 ? '' : 's'}`)()
    },
  })

  if (!Number.isFinite(userId)) {
    return <div className='p-6'>Invalid user id</div>
  }

  if (isLoading) return <div className='p-6'>Loading…</div>
  if (!data?.success || !data.data) {
    return (
      <div className='p-6'>
        <p className='text-error'>Failed to load: {data?.error?.message ?? 'unknown'}</p>
        <Link href='/chat-moderation' className='btn btn-secondary mt-4'>
          Back
        </Link>
      </div>
    )
  }

  const info: ChatModInfo = data.data
  const isBanned = info.status.status === 'banned'

  const isPending =
    banMutation.isPending || unbanMutation.isPending || deleteMessagesMutation.isPending

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <Link href='/chat-moderation' className='text-primary text-sm hover:underline'>
            ← Back to chat moderation
          </Link>
          <h1 className='mt-2 text-2xl font-bold'>User #{info.user.id}</h1>
          <p className='text-neutral font-mono text-sm'>{info.user.address}</p>
        </div>
        <div className='flex gap-2'>
          {!isBanned && (
            <button onClick={() => setConfirmAction('ban')} className='btn btn-danger'>
              Ban from messaging
            </button>
          )}
          {isBanned && (
            <button onClick={() => setConfirmAction('unban')} className='btn btn-secondary'>
              Restore
            </button>
          )}
          <button
            onClick={() => setConfirmAction('delete-messages')}
            className='btn btn-danger'
            disabled={info.messageStats.visible === 0}
          >
            Delete all messages
          </button>
        </div>
      </div>

      <div className='card grid grid-cols-2 gap-4 md:grid-cols-4'>
        <div>
          <div className='text-neutral text-xs'>Status</div>
          <div
            className={
              isBanned
                ? 'text-error font-medium'
                : 'text-success font-medium'
            }
          >
            {info.status.status}
          </div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Messages (visible / total)</div>
          <div className='font-medium'>
            {info.messageStats.visible} / {info.messageStats.total}
          </div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Banned at</div>
          <div className='text-sm'>
            {info.status.banned_at
              ? new Date(info.status.banned_at).toLocaleString()
              : '—'}
          </div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Account created</div>
          <div className='text-sm'>{new Date(info.user.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      {info.status.last_action_reason && (
        <div className='card'>
          <div className='text-neutral text-xs'>Last action reason</div>
          <div className='text-sm'>{info.status.last_action_reason}</div>
        </div>
      )}

      <div>
        <h2 className='mb-3 text-lg font-semibold'>Recent messages</h2>
        <div className='card overflow-x-auto p-0'>
          <table className='w-full'>
            <thead>
              <tr className='text-left text-xs'>
                <th>Time</th>
                <th>Chat</th>
                <th>Body</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {info.messages.length === 0 ? (
                <tr>
                  <td colSpan={4} className='text-neutral px-4 py-6 text-center'>
                    No messages
                  </td>
                </tr>
              ) : (
                info.messages.map((m) => (
                  <tr key={m.id}>
                    <td className='text-neutral text-xs whitespace-nowrap'>
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className='font-mono text-xs'>{m.chat_id.slice(0, 8)}…</td>
                    <td className='max-w-md truncate text-sm'>{m.body}</td>
                    <td className='text-xs'>
                      {m.deleted_at ? (
                        <span className='text-error'>deleted</span>
                      ) : (
                        <span className='text-success'>visible</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className='mb-3 text-lg font-semibold'>Moderation log</h2>
        <div className='card overflow-x-auto p-0'>
          <table className='w-full'>
            <thead>
              <tr className='text-left text-xs'>
                <th>Time</th>
                <th>Action</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {info.log.length === 0 ? (
                <tr>
                  <td colSpan={3} className='text-neutral px-4 py-6 text-center'>
                    No mod actions
                  </td>
                </tr>
              ) : (
                info.log.map((l) => (
                  <tr key={l.id}>
                    <td className='text-neutral text-xs whitespace-nowrap'>
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className='text-sm'>{l.action}</td>
                    <td className='text-sm'>{l.reason ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => {
          setConfirmAction(null)
          setReason('')
        }}
        isLoading={isPending}
        onConfirm={() => {
          if (!reason.trim() && confirmAction !== 'unban') {
            toast.error('Reason is required')
            return
          }
          if (confirmAction === 'ban') banMutation.mutate()
          else if (confirmAction === 'unban') unbanMutation.mutate()
          else if (confirmAction === 'delete-messages') deleteMessagesMutation.mutate()
        }}
        variant={confirmAction === 'unban' ? 'default' : 'danger'}
        title={
          confirmAction === 'ban'
            ? 'Ban user from messaging?'
            : confirmAction === 'unban'
              ? 'Restore messaging access?'
              : confirmAction === 'delete-messages'
                ? `Delete ${info.messageStats.visible} message${info.messageStats.visible === 1 ? '' : 's'}?`
                : ''
        }
        confirmText={
          confirmAction === 'ban'
            ? 'Ban user'
            : confirmAction === 'unban'
              ? 'Restore'
              : 'Delete all messages'
        }
        message={
          <div className='space-y-3 text-left'>
            {confirmAction === 'delete-messages' && (
              <p className='text-sm'>
                This will soft-delete every message {info.user.address.slice(0, 6)}…
                {info.user.address.slice(-4)} has sent. The messages will no longer be
                returned by the chat API. This is a one-shot action — running it again
                later will only catch any new messages sent in the meantime.
              </p>
            )}
            {confirmAction === 'ban' && (
              <p className='text-sm'>
                The user will receive a 403 when trying to send a message or start a new
                chat. Use Restore to lift the ban.
              </p>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason</label>
              <input
                type='text'
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className='border-border bg-tertiary w-full rounded border px-2 py-1 text-sm'
                placeholder={
                  confirmAction === 'unban'
                    ? 'Optional note for the audit log'
                    : 'Reason shown to the user'
                }
              />
            </div>
          </div>
        }
      />
    </div>
  )
}
