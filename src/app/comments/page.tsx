'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listComments,
  deleteComment,
  type AdminComment,
} from '@/api/comments'
import { ConfirmModal } from '@/components/ConfirmModal'

const STATUS_OPTIONS = ['all', 'visible', 'deleted', 'hidden'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]

export default function CommentsPage() {
  const [author, setAuthor] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [appliedFilters, setAppliedFilters] = useState<{
    author?: string
    name?: string
    status?: StatusFilter
    from?: string
    to?: string
  }>({})

  const [confirmDelete, setConfirmDelete] = useState<AdminComment | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'comments', appliedFilters],
    queryFn: () =>
      listComments({
        ...appliedFilters,
        limit: 100,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteComment(id, reason),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.message ?? 'Failed to delete')
        return
      }
      toast.success('Comment deleted. User will be notified.')
      setConfirmDelete(null)
      setDeleteReason('')
      refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const apply = () => {
    setAppliedFilters({
      author: author.trim() || undefined,
      name: name.trim() || undefined,
      status,
      from: from || undefined,
      to: to || undefined,
    })
  }

  const reset = () => {
    setAuthor('')
    setName('')
    setStatus('all')
    setFrom('')
    setTo('')
    setAppliedFilters({})
  }

  const comments = data?.data?.comments ?? []

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>Comments Moderation</h1>
          <p className='text-neutral text-sm'>
            {comments.length} comment{comments.length === 1 ? '' : 's'} matching filters
          </p>
        </div>
        <div className='flex gap-2'>
          <Link href='/comments/blacklist' className='btn btn-secondary'>
            Blacklist
          </Link>
          <Link href='/comments/settings' className='btn btn-secondary'>
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='ENS name (e.g. vitalik.eth)'
          className='w-full md:col-span-2'
        />
        <input
          type='text'
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder='Author (0x… or user id)'
          className='w-full md:col-span-2'
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
              <th className='px-4 py-3'>Author</th>
              <th className='px-4 py-3'>Name</th>
              <th className='px-4 py-3'>Body</th>
              <th className='px-4 py-3'>Status</th>
              <th className='px-4 py-3 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className='text-neutral px-4 py-8 text-center'>
                  Loading…
                </td>
              </tr>
            ) : comments.length === 0 ? (
              <tr>
                <td colSpan={6} className='text-neutral px-4 py-8 text-center'>
                  No comments match the filters.
                </td>
              </tr>
            ) : (
              comments.map((c) => (
                <tr key={c.id} className='border-border border-b last:border-b-0'>
                  <td className='text-neutral px-4 py-3 text-xs whitespace-nowrap'>
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className='px-4 py-3 font-mono text-xs'>
                    <Link
                      href={`/comments/users/${c.user_id}`}
                      className='text-primary hover:underline'
                    >
                      {c.author_address.slice(0, 8)}…{c.author_address.slice(-4)}
                    </Link>
                    {c.author_mod_status && c.author_mod_status !== 'active' && (
                      <span className='ml-2 inline-block rounded bg-amber-600/20 px-1.5 py-0.5 text-[10px] text-amber-400'>
                        {c.author_mod_status}
                      </span>
                    )}
                  </td>
                  <td className='px-4 py-3 text-sm'>
                    <Link
                      href={`/names/${encodeURIComponent(c.ens_name)}`}
                      className='text-primary hover:underline'
                    >
                      {c.ens_name}
                    </Link>
                  </td>
                  <td className='max-w-md truncate px-4 py-3 text-sm'>
                    {c.body_censored ?? c.body}
                  </td>
                  <td className='px-4 py-3 text-xs'>
                    <span
                      className={
                        c.status === 'deleted'
                          ? 'text-error'
                          : c.status === 'hidden'
                            ? 'text-amber-500'
                            : 'text-success'
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-right'>
                    {c.status !== 'deleted' && (
                      <button
                        onClick={() => setConfirmDelete(c)}
                        className='text-error hover:underline'
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
        title='Delete comment?'
        confirmText='Delete'
        message={
          <div className='space-y-3 text-left'>
            <p>
              This will soft-delete the comment and notify the author. Repeated
              deletions may auto-warn or auto-suspend the user according to the
              configured thresholds.
            </p>
            {confirmDelete && (
              <div className='bg-tertiary rounded p-2 text-xs'>
                {confirmDelete.body_censored ?? confirmDelete.body}
              </div>
            )}
            <div>
              <label className='text-neutral mb-1 block text-xs'>Reason</label>
              <input
                type='text'
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className='w-full'
                placeholder='Why is this being deleted?'
              />
            </div>
          </div>
        }
      />
    </div>
  )
}
