'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getConfig, updateConfig, type CommentConfig } from '@/api/comments'

interface FieldSpec {
  key: keyof CommentConfig
  label: string
  description: string
  type: 'int' | 'float'
  min?: number
  max?: number
}

const FIELDS: FieldSpec[] = [
  {
    key: 'warning_threshold',
    label: 'Warning threshold',
    description: 'Deletions in window before the user gets a warning notification.',
    type: 'int',
    min: 1,
    max: 100,
  },
  {
    key: 'suspension_threshold',
    label: 'Suspension threshold',
    description: 'Deletions in window before the user is auto-suspended.',
    type: 'int',
    min: 1,
    max: 100,
  },
  {
    key: 'suspension_window_days',
    label: 'Window (days)',
    description: 'Rolling window over which deletions are counted.',
    type: 'int',
    min: 1,
    max: 365,
  },
  {
    key: 'default_suspension_days',
    label: 'Default suspension (days)',
    description: 'How long an auto-suspension lasts.',
    type: 'int',
    min: 1,
    max: 365,
  },
  {
    key: 'quota_cap',
    label: 'Quota cap',
    description: 'Maximum daily comments any user can earn from the formula.',
    type: 'int',
    min: 1,
    max: 10000,
  },
  {
    key: 'quota_floor',
    label: 'Quota floor',
    description: 'Minimum daily comments for any logged-in user.',
    type: 'int',
    min: 0,
    max: 10000,
  },
  {
    key: 'quota_names_weight',
    label: 'Names weight',
    description: 'Multiplier on min(names_owned, 20).',
    type: 'float',
    min: 0,
    max: 1000,
  },
  {
    key: 'quota_listings_weight',
    label: 'Listings weight',
    description: 'Multiplier on active listings count.',
    type: 'float',
    min: 0,
    max: 1000,
  },
  {
    key: 'quota_eth_weight',
    label: 'ETH/WETH weight',
    description: 'Multiplier on (ETH + WETH) balance, in ETH units.',
    type: 'float',
    min: 0,
    max: 1000,
  },
  {
    key: 'max_comment_length',
    label: 'Max comment length',
    description: 'Hard cap on comment body length (characters).',
    type: 'int',
    min: 10,
    max: 5000,
  },
]

export default function CommentSettingsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'comments', 'config'],
    queryFn: getConfig,
  })
  const [draft, setDraft] = useState<CommentConfig | null>(null)

  useEffect(() => {
    if (data?.data?.config) setDraft(data.data.config)
  }, [data])

  const save = useMutation({
    mutationFn: (patch: Partial<CommentConfig>) => updateConfig(patch),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('Config updated')
      refetch()
    },
  })

  if (isLoading || !draft) return <div className='p-6'>Loading…</div>

  const original = data?.data?.config
  const dirtyKeys: (keyof CommentConfig)[] = []
  if (original) {
    for (const k of Object.keys(draft) as (keyof CommentConfig)[]) {
      if (Number(draft[k]) !== Number(original[k])) dirtyKeys.push(k)
    }
  }
  const isDirty = dirtyKeys.length > 0

  return (
    <div className='space-y-6 p-6'>
      <div>
        <Link href='/comments' className='text-primary text-sm hover:underline'>
          ← Back to comments
        </Link>
        <h1 className='mt-2 text-2xl font-bold'>Comment moderation settings</h1>
        <p className='text-neutral text-sm'>
          Tune thresholds and quota weights. Changes apply immediately to new comments.
        </p>
      </div>

      <div className='card space-y-4'>
        {FIELDS.map((f) => (
          <div key={f.key} className='grid grid-cols-1 gap-2 md:grid-cols-3 md:items-start'>
            <div>
              <div className='text-sm font-medium'>{f.label}</div>
              <div className='text-neutral text-xs'>{f.description}</div>
            </div>
            <div className='md:col-span-2'>
              <input
                type='number'
                step={f.type === 'float' ? 0.1 : 1}
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                onChange={(e) => {
                  const n = f.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
                  setDraft({ ...draft, [f.key]: Number.isFinite(n) ? n : draft[f.key] })
                }}
                className='w-full md:max-w-xs'
              />
            </div>
          </div>
        ))}

        <div className='flex justify-end gap-2 pt-4'>
          <button
            onClick={() => original && setDraft(original)}
            disabled={!isDirty}
            className='btn btn-secondary'
          >
            Reset
          </button>
          <button
            onClick={() => {
              const patch: Partial<CommentConfig> = {}
              for (const k of dirtyKeys) (patch as Record<string, number>)[k] = Number(draft[k])
              save.mutate(patch)
            }}
            disabled={!isDirty || save.isPending}
            className='btn btn-primary'
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
