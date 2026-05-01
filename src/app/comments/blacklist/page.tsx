'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listBlacklist,
  addBlacklistTerm,
  removeBlacklistTerm,
  type BlacklistTerm,
} from '@/api/comments'
import { ConfirmModal } from '@/components/ConfirmModal'

export default function BlacklistPage() {
  const [newTerm, setNewTerm] = useState('')
  const [newAction, setNewAction] = useState<'censor' | 'block'>('censor')
  const [confirmRemove, setConfirmRemove] = useState<BlacklistTerm | null>(null)

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['admin', 'comments', 'blacklist'],
    queryFn: listBlacklist,
  })

  const addMutation = useMutation({
    mutationFn: () => addBlacklistTerm(newTerm.trim(), newAction),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('Term added')
      setNewTerm('')
      refetch()
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeBlacklistTerm(id),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('Term removed')
      setConfirmRemove(null)
      refetch()
    },
  })

  const terms = data?.data?.terms ?? []

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <Link href='/comments' className='text-primary text-sm hover:underline'>
            ← Back to comments
          </Link>
          <h1 className='mt-2 text-2xl font-bold'>Comment term blacklist</h1>
          <p className='text-neutral text-sm'>
            Censor (replace with ***) or block (reject the comment) on a per-term basis.
            Matching is case-insensitive at word boundaries.
          </p>
        </div>
      </div>

      <div className='card'>
        <h2 className='mb-3 text-lg font-semibold'>Add a term</h2>
        <div className='flex flex-col gap-3 md:flex-row'>
          <input
            type='text'
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder='Term (case-insensitive)'
            className='flex-1'
            maxLength={100}
          />
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value as 'censor' | 'block')}
          >
            <option value='censor'>Censor (replace with ***)</option>
            <option value='block'>Block (reject comment)</option>
          </select>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!newTerm.trim() || addMutation.isPending}
            className='btn btn-primary'
          >
            {addMutation.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <div className='card overflow-x-auto p-0'>
        <table className='w-full'>
          <thead className='border-border border-b'>
            <tr className='text-left text-xs'>
              <th className='px-4 py-3'>Term</th>
              <th className='px-4 py-3'>Action</th>
              <th className='px-4 py-3'>Added</th>
              <th className='px-4 py-3 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className='text-neutral px-4 py-6 text-center'>
                  Loading…
                </td>
              </tr>
            ) : terms.length === 0 ? (
              <tr>
                <td colSpan={4} className='text-neutral px-4 py-6 text-center'>
                  No terms in the blacklist.
                </td>
              </tr>
            ) : (
              terms.map((t) => (
                <tr key={t.id} className='border-border border-b last:border-b-0'>
                  <td className='px-4 py-3 font-mono'>{t.term}</td>
                  <td className='px-4 py-3'>
                    <span
                      className={
                        t.action === 'block' ? 'text-error' : 'text-amber-400'
                      }
                    >
                      {t.action}
                    </span>
                  </td>
                  <td className='text-neutral px-4 py-3 text-xs'>
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className='px-4 py-3 text-right'>
                    <button
                      onClick={() => setConfirmRemove(t)}
                      className='text-error hover:underline'
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && removeMutation.mutate(confirmRemove.id)}
        isLoading={removeMutation.isPending}
        variant='danger'
        title='Remove term?'
        confirmText='Remove'
        message={
          <span>
            Remove <span className='font-mono'>&ldquo;{confirmRemove?.term}&rdquo;</span> from
            the blacklist? Existing comments are not modified.
          </span>
        }
      />
    </div>
  )
}
