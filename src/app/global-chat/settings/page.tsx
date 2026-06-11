'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getGlobalChatConfig,
  updateGlobalChatConfig,
  type GlobalChatConfig,
} from '@/api/global-chat'

interface FieldSpec {
  key: keyof GlobalChatConfig
  label: string
  description: string
  type: 'boolean' | 'int' | 'nullable-int'
  min?: number
  max?: number
  hint?: string
}

const FIELDS: FieldSpec[] = [
  {
    key: 'enabled',
    label: 'Enabled',
    description: 'Whether the global chat is open for posting.',
    type: 'boolean',
  },
  {
    key: 'quota_with_avatar',
    label: 'Quota (ENS name + avatar)',
    description: 'Daily message quota for users with a primary ENS name and avatar.',
    type: 'nullable-int',
    min: 0,
    max: 10000,
    hint: 'Leave empty for unlimited',
  },
  {
    key: 'quota_with_name',
    label: 'Quota (ENS name)',
    description: 'Daily message quota for users with a primary ENS name but no avatar.',
    type: 'int',
    min: 0,
    max: 10000,
  },
  {
    key: 'quota_without_name',
    label: 'Quota (no ENS name)',
    description: 'Daily message quota for users without a primary ENS name.',
    type: 'int',
    min: 0,
    max: 10000,
  },
  {
    key: 'max_message_length',
    label: 'Max message length',
    description: 'Hard cap on message body length (characters).',
    type: 'int',
    min: 1,
    max: 4000,
  },
  {
    key: 'rate_limit_per_minute',
    label: 'Rate limit (per minute)',
    description:
      'Messages a user can send per minute before getting a 429 — burst control, distinct from the daily quota tiers.',
    type: 'int',
    min: 1,
    max: 600,
  },
]

function normalize(key: keyof GlobalChatConfig, value: GlobalChatConfig[keyof GlobalChatConfig]) {
  if (key === 'enabled') return Boolean(value)
  return value === null ? null : Number(value)
}

export default function GlobalChatSettingsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'global-chat', 'config'],
    queryFn: getGlobalChatConfig,
  })
  const [draft, setDraft] = useState<GlobalChatConfig | null>(null)

  useEffect(() => {
    if (data?.data?.config) setDraft(data.data.config)
  }, [data])

  const save = useMutation({
    mutationFn: (patch: Partial<GlobalChatConfig>) => updateGlobalChatConfig(patch),
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
  const dirtyKeys: (keyof GlobalChatConfig)[] = []
  if (original) {
    for (const k of Object.keys(draft) as (keyof GlobalChatConfig)[]) {
      if (normalize(k, draft[k]) !== normalize(k, original[k])) dirtyKeys.push(k)
    }
  }
  const isDirty = dirtyKeys.length > 0

  return (
    <div className='space-y-6 p-6'>
      <div>
        <Link href='/global-chat' className='text-primary text-sm hover:underline'>
          ← Back to global chat
        </Link>
        <h1 className='mt-2 text-2xl font-bold'>Global chat settings</h1>
        <p className='text-neutral text-sm'>
          Tune quotas and limits. Changes apply immediately to new messages.
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
              {f.type === 'boolean' ? (
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={Boolean(draft[f.key])}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })}
                  />
                  {Boolean(draft[f.key]) ? 'Enabled' : 'Disabled'}
                </label>
              ) : (
                <>
                  <input
                    type='number'
                    step={1}
                    min={f.min}
                    max={f.max}
                    value={draft[f.key] === null ? '' : Number(draft[f.key])}
                    placeholder={f.type === 'nullable-int' ? 'Unlimited' : undefined}
                    onChange={(e) => {
                      if (f.type === 'nullable-int' && e.target.value === '') {
                        setDraft({ ...draft, [f.key]: null })
                        return
                      }
                      const n = parseInt(e.target.value, 10)
                      setDraft({ ...draft, [f.key]: Number.isFinite(n) ? n : draft[f.key] })
                    }}
                    className='w-full md:max-w-xs'
                  />
                  {f.hint && <div className='text-neutral mt-1 text-xs'>{f.hint}</div>}
                </>
              )}
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
              const patch: Partial<GlobalChatConfig> = {}
              for (const k of dirtyKeys) {
                ;(patch as Record<string, number | boolean | null>)[k] = normalize(
                  k,
                  draft[k]
                )
              }
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
