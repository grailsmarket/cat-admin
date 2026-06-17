'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getValuationSettings,
  updateValuationSettings,
  type ValuationSettings,
} from '@/api/valuations'

interface FieldSpec {
  key: keyof ValuationSettings
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
    description: 'Whether the valuation tool is open for generating new valuations.',
    type: 'boolean',
  },
  {
    key: 'window_days',
    label: 'Quota window (days)',
    description: 'Rolling window over which a user’s generations are counted.',
    type: 'int',
    min: 1,
    max: 365,
  },
  {
    key: 'quota_admin',
    label: 'Quota (admin)',
    description: 'Generations per window for admins (users.is_admin).',
    type: 'nullable-int',
    min: 0,
    max: 100000,
    hint: 'Leave empty for unlimited',
  },
  {
    key: 'quota_avatar',
    label: 'Quota (ENS name + avatar)',
    description: 'Generations per window for users who own an ENS name with an avatar.',
    type: 'nullable-int',
    min: 0,
    max: 100000,
    hint: 'Leave empty for unlimited',
  },
  {
    key: 'quota_name',
    label: 'Quota (ENS name)',
    description: 'Generations per window for users who own an ENS name (no avatar).',
    type: 'int',
    min: 0,
    max: 100000,
  },
  {
    key: 'quota_default',
    label: 'Quota (no ENS name)',
    description: 'Generations per window for users who own no ENS name.',
    type: 'int',
    min: 0,
    max: 100000,
  },
  {
    key: 'evidence_cache_days',
    label: 'Evidence cache TTL (days)',
    description: 'How long stable per-name research/evidence (Tier 1) is cached.',
    type: 'int',
    min: 1,
    max: 3650,
  },
  {
    key: 'valuation_days',
    label: 'Valuation cache TTL (days)',
    description: 'How long a full valuation result (Tier 2) is cached + served publicly.',
    type: 'int',
    min: 1,
    max: 3650,
  },
]

function normalize(key: keyof ValuationSettings, value: ValuationSettings[keyof ValuationSettings]) {
  if (key === 'enabled') return Boolean(value)
  if (key === 'updated_at') return value
  return value === null ? null : Number(value)
}

export default function ValuationSettingsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'valuations', 'config'],
    queryFn: getValuationSettings,
  })
  const [draft, setDraft] = useState<ValuationSettings | null>(null)

  useEffect(() => {
    if (data?.data?.config) setDraft(data.data.config)
  }, [data])

  const save = useMutation({
    mutationFn: (patch: Partial<ValuationSettings>) => updateValuationSettings(patch),
    onSuccess: (r) => {
      if (!r.success) {
        toast.error(r.error?.message ?? 'Failed')
        return
      }
      toast.success('Settings updated')
      refetch()
    },
  })

  if (isLoading || !draft) return <div className='p-6'>Loading…</div>

  const original = data?.data?.config
  const editableKeys = FIELDS.map((f) => f.key)
  const dirtyKeys: (keyof ValuationSettings)[] = []
  if (original) {
    for (const k of editableKeys) {
      if (normalize(k, draft[k]) !== normalize(k, original[k])) dirtyKeys.push(k)
    }
  }
  const isDirty = dirtyKeys.length > 0

  return (
    <div className='space-y-6 p-6'>
      <div>
        <Link href='/' className='text-primary text-sm hover:underline'>
          ← Back to dashboard
        </Link>
        <h1 className='mt-2 text-2xl font-bold'>Valuation settings</h1>
        <p className='text-neutral text-sm'>
          Tune the valuation feature toggle, per-tier quotas, and cache lifetimes. Changes apply
          immediately to new valuations.
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
              const patch: Partial<ValuationSettings> = {}
              for (const k of dirtyKeys) {
                ;(patch as Record<string, number | boolean | null>)[k] = normalize(
                  k,
                  draft[k]
                ) as number | boolean | null
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
