'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getUserModInfo,
  suspendUser,
  banUser,
  unbanUser,
  type UserModInfo,
} from '@/api/comments'
import { ConfirmModal } from '@/components/ConfirmModal'

export default function UserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId: userIdStr } = use(params)
  const userId = parseInt(userIdStr, 10)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'comments', 'user', userId],
    queryFn: () => getUserModInfo(userId),
    enabled: Number.isFinite(userId),
  })

  const [suspendDays, setSuspendDays] = useState(7)
  const [reason, setReason] = useState('')
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'ban' | 'unban' | null>(null)

  const suspendMutation = useMutation({
    mutationFn: () => suspendUser(userId, suspendDays, reason),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success(`Suspended for ${suspendDays} days`)
      setConfirmAction(null)
      setReason('')
      refetch()
    },
  })

  const banMutation = useMutation({
    mutationFn: () => banUser(userId, reason),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('User banned')
      setConfirmAction(null)
      setReason('')
      refetch()
    },
  })

  const unbanMutation = useMutation({
    mutationFn: () => unbanUser(userId, reason),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('User restored')
      setConfirmAction(null)
      setReason('')
      refetch()
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
        <Link href='/comments' className='btn btn-secondary mt-4'>
          Back
        </Link>
      </div>
    )
  }

  const info: UserModInfo = data.data
  const status = info.status

  const isSuspended =
    status.status === 'suspended' &&
    status.suspended_until &&
    new Date(status.suspended_until) > new Date()
  const isBanned = status.status === 'banned'

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <Link href='/comments' className='text-primary text-sm hover:underline'>
            ← Back to comments
          </Link>
          <h1 className='mt-2 text-2xl font-bold'>User #{info.user.id}</h1>
          <p className='text-neutral font-mono text-sm'>{info.user.address}</p>
        </div>
        <div className='flex gap-2'>
          {!isBanned && (
            <button onClick={() => setConfirmAction('suspend')} className='btn bg-amber-600 text-white'>
              Suspend
            </button>
          )}
          {!isBanned && (
            <button onClick={() => setConfirmAction('ban')} className='btn btn-danger'>
              Permanent ban
            </button>
          )}
          {(isBanned || isSuspended) && (
            <button onClick={() => setConfirmAction('unban')} className='btn btn-secondary'>
              Restore
            </button>
          )}
        </div>
      </div>

      <div className='card grid grid-cols-2 gap-4 md:grid-cols-4'>
        <div>
          <div className='text-neutral text-xs'>Status</div>
          <div
            className={
              status.status === 'banned'
                ? 'text-error font-medium'
                : status.status === 'suspended'
                  ? 'text-amber-500 font-medium'
                  : status.status === 'warned'
                    ? 'text-amber-400 font-medium'
                    : 'text-success font-medium'
            }
          >
            {status.status}
          </div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Deletions (30d)</div>
          <div className='font-medium'>{status.deletion_count_30d}</div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Suspended until</div>
          <div className='text-sm'>
            {status.suspended_until
              ? new Date(status.suspended_until).toLocaleString()
              : '—'}
          </div>
        </div>
        <div>
          <div className='text-neutral text-xs'>Account created</div>
          <div className='text-sm'>{new Date(info.user.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div>
        <h2 className='mb-3 text-lg font-semibold'>Recent comments</h2>
        <div className='card overflow-x-auto p-0'>
          <table className='w-full'>
            <thead>
              <tr className='text-left text-xs'>
                <th>Time</th>
                <th>Name</th>
                <th>Body</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {info.comments.length === 0 ? (
                <tr>
                  <td colSpan={4} className='text-neutral px-4 py-6 text-center'>
                    No comments
                  </td>
                </tr>
              ) : (
                info.comments.map((c) => (
                  <tr key={c.id}>
                    <td className='text-neutral text-xs whitespace-nowrap'>
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td className='text-sm'>{c.ens_name}</td>
                    <td className='max-w-md truncate text-sm'>{c.body_censored ?? c.body}</td>
                    <td className='text-xs'>{c.status}</td>
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
        isLoading={
          suspendMutation.isPending || banMutation.isPending || unbanMutation.isPending
        }
        onConfirm={() => {
          if (!reason.trim() && confirmAction !== 'unban') {
            toast.error('Reason is required')
            return
          }
          if (confirmAction === 'suspend') suspendMutation.mutate()
          else if (confirmAction === 'ban') banMutation.mutate()
          else if (confirmAction === 'unban') unbanMutation.mutate()
        }}
        variant={confirmAction === 'unban' ? 'default' : confirmAction === 'ban' ? 'danger' : 'warning'}
        title={
          confirmAction === 'suspend'
            ? 'Suspend user?'
            : confirmAction === 'ban'
              ? 'Permanently ban user?'
              : 'Restore user?'
        }
        confirmText={
          confirmAction === 'suspend'
            ? 'Suspend'
            : confirmAction === 'ban'
              ? 'Ban permanently'
              : 'Restore'
        }
        message={
          <div className='space-y-3 text-left'>
            {confirmAction === 'suspend' && (
              <div>
                <label className='text-neutral mb-1 block text-xs'>Days</label>
                <input
                  type='number'
                  min={1}
                  max={365}
                  value={suspendDays}
                  onChange={(e) => setSuspendDays(parseInt(e.target.value, 10) || 7)}
                  className='w-full'
                />
              </div>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason</label>
              <input
                type='text'
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className='w-full'
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
