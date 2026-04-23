'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchAccount } from 'ethereum-identity-kit'
import {
  previewNotification,
  sendTestNotification,
  sendBroadcast,
  listBroadcasts,
  uploadNotificationImage,
  type Channel,
  type AudienceFilter,
  type TierId,
} from '@/api/notifications'
import { ConfirmModal } from '@/components/ConfirmModal'

type AudienceType = 'everyone' | 'specific' | 'unsubscribed' | 'tiers'
type Chip = { address: string; label: string }

const TIER_LABELS: Record<TierId, string> = { 1: 'Plus', 2: 'Pro', 3: 'Gold' }
const TIER_IDS: TierId[] = [1, 2, 3]

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ENS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

export default function NotificationsPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [email, setEmail] = useState(true)
  const [telegram, setTelegram] = useState(true)

  const [audienceType, setAudienceType] = useState<AudienceType>('everyone')
  const [chips, setChips] = useState<Chip[]>([])
  const [specificInput, setSpecificInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [selectedTiers, setSelectedTiers] = useState<TierId[]>([])

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageDragOver, setImageDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<{ total: number; email: number; telegram: number } | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const channels: Channel[] = ['in_app']
  if (email) channels.push('email')
  if (telegram) channels.push('telegram')

  const audience: AudienceFilter = (() => {
    switch (audienceType) {
      case 'everyone':
        return { type: 'everyone' }
      case 'specific':
        return { type: 'specific', addresses: chips.map((c) => c.address) }
      case 'unsubscribed':
        return { type: 'unsubscribed' }
      case 'tiers':
        return { type: 'tiers', tierIds: selectedTiers }
    }
  })()

  const payload = {
    title: title.trim(),
    body: body.trim(),
    linkUrl: linkUrl.trim() || undefined,
    imageUrl: imageUrl || undefined,
    channels,
    audience,
  }
  const audienceValid =
    (audience.type !== 'specific' || audience.addresses.length > 0) &&
    (audience.type !== 'tiers' || audience.tierIds.length > 0)
  const canCompose =
    payload.title.length > 0 && payload.body.length > 0 && channels.length >= 1 && audienceValid

  const resetPreview = () => setPreview(null)

  const changeAudienceType = (next: AudienceType) => {
    setAudienceType(next)
    setAddError(null)
    resetPreview()
  }

  const addChip = async () => {
    setAddError(null)
    const raw = specificInput.trim()
    if (!raw) return

    if (ADDRESS_RE.test(raw)) {
      const addr = raw.toLowerCase()
      if (chips.some((c) => c.address === addr)) {
        setAddError('Already added')
        return
      }
      setChips([...chips, { address: addr, label: `${addr.slice(0, 6)}…${addr.slice(-4)}` }])
      setSpecificInput('')
      resetPreview()
      return
    }

    if (ENS_RE.test(raw)) {
      setResolving(true)
      try {
        const account = await fetchAccount(raw)
        const resolved = account?.address?.toLowerCase()
        if (!resolved || !ADDRESS_RE.test(resolved)) {
          setAddError(`Couldn't resolve ${raw}`)
          return
        }
        if (chips.some((c) => c.address === resolved)) {
          setAddError(`${raw} is already added`)
          return
        }
        setChips([...chips, { address: resolved, label: raw }])
        setSpecificInput('')
        resetPreview()
      } catch {
        setAddError(`Couldn't resolve ${raw}`)
      } finally {
        setResolving(false)
      }
      return
    }

    setAddError('Enter an Ethereum address or ENS name')
  }

  const removeChip = (addr: string) => {
    setChips(chips.filter((c) => c.address !== addr))
    resetPreview()
  }

  const handleImageSelect = async (file: File) => {
    setImageError(null)
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageError('Only JPEG and PNG files are allowed.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setImageError('File must be 2 MB or less.')
      return
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview)
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
    setImageUrl(null)
    setImageUploading(true)
    try {
      const result = await uploadNotificationImage(file)
      if (result.success && result.data) {
        setImageUrl(result.data.url)
      } else {
        URL.revokeObjectURL(previewUrl)
        setImagePreview(null)
        setImageError(result.error || 'Upload failed')
      }
    } catch {
      URL.revokeObjectURL(previewUrl)
      setImagePreview(null)
      setImageError('Upload failed')
    } finally {
      setImageUploading(false)
    }
  }

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setImageDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleImageSelect(file)
  }

  const handleImageRemove = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    setImageUrl(null)
    setImageError(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const history = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: () => listBroadcasts(1, 25),
  })

  const previewMutation = useMutation({
    mutationFn: () => previewNotification({ channels, audience }),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setPreview({
          total: res.data.totalRecipients,
          email: res.data.byChannel.email,
          telegram: res.data.byChannel.telegram,
        })
        setFlash(null)
      } else {
        setFlash({ kind: 'error', text: res.error || 'Preview failed' })
      }
    },
    onError: () => setFlash({ kind: 'error', text: 'Preview request failed' }),
  })

  const testMutation = useMutation({
    mutationFn: () =>
      sendTestNotification({
        title: payload.title,
        body: payload.body,
        linkUrl: payload.linkUrl,
        imageUrl: payload.imageUrl,
        channels,
      }),
    onSuccess: (res) => {
      if (res.success) {
        setFlash({ kind: 'success', text: 'Test notification sent to your account.' })
        history.refetch()
      } else {
        setFlash({ kind: 'error', text: res.error || 'Test send failed' })
      }
    },
    onError: () => setFlash({ kind: 'error', text: 'Test send request failed' }),
  })

  const broadcastMutation = useMutation({
    mutationFn: () => sendBroadcast(payload),
    onSuccess: (res) => {
      setConfirmOpen(false)
      if (res.success && res.data) {
        setFlash({
          kind: 'success',
          text: `Broadcast #${res.data.broadcastId} sent to ${res.data.enqueued ?? 0} user${res.data.enqueued === 1 ? '' : 's'}.`,
        })
        setTitle('')
        setBody('')
        setLinkUrl('')
        if (imagePreview) URL.revokeObjectURL(imagePreview)
        setImagePreview(null)
        setImageUrl(null)
        setImageError(null)
        setChips([])
        setSelectedTiers([])
        setAudienceType('everyone')
        setPreview(null)
        history.refetch()
      } else {
        setFlash({ kind: 'error', text: res.error || 'Broadcast failed' })
      }
    },
    onError: () => {
      setConfirmOpen(false)
      setFlash({ kind: 'error', text: 'Broadcast request failed' })
    },
  })

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const broadcasts = history.data?.data?.broadcasts ?? []

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Notifications</h1>
        <p className='text-neutral mt-2 text-sm'>
          Send custom announcements to users via in-app, email, and/or Telegram.
        </p>
      </div>

      {flash && (
        <div
          className={`mb-6 rounded-lg border p-4 ${
            flash.kind === 'success'
              ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400'
              : 'bg-error/10 border-error text-error'
          }`}
        >
          {flash.text}
        </div>
      )}

      <div className='card mb-8'>
        <h2 className='mb-4 text-lg font-semibold'>Compose</h2>

        <div className='mb-4'>
          <label className='mb-1 block text-sm font-medium'>Title</label>
          <input
            type='text'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder='E.g. Grails update: new analytics'
            className='w-full'
          />
        </div>

        <div className='mb-4'>
          <label className='mb-1 block text-sm font-medium'>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={6}
            placeholder='Plain text. Line breaks are preserved.'
            className='w-full'
          />
          <div className='text-neutral mt-1 text-xs'>{body.length} / 5000</div>
        </div>

        <div className='mb-4'>
          <label className='mb-1 block text-sm font-medium'>Link (optional)</label>
          <input
            type='url'
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder='https://grails.app/...'
            className='w-full'
          />
        </div>

        <div className='mb-4'>
          <label className='mb-1 block text-sm font-medium'>Image (optional)</label>
          <div
            onDrop={handleImageDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setImageDragOver(true)
            }}
            onDragLeave={() => setImageDragOver(false)}
          >
            {imagePreview ? (
              <div className='space-y-2'>
                <div className='relative inline-block max-w-full'>
                  <img
                    src={imagePreview}
                    alt=''
                    className='block max-h-64 max-w-full rounded-lg border border-border'
                  />
                  {imageUploading && (
                    <div className='absolute inset-0 flex items-center justify-center rounded-lg bg-black/40'>
                      <div className='h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent' />
                    </div>
                  )}
                </div>
                <div className='flex items-center gap-3 text-xs'>
                  <button
                    type='button'
                    onClick={handleImageRemove}
                    className='btn btn-secondary'
                  >
                    Remove image
                  </button>
                  <span className='text-neutral'>
                    {imageUploading
                      ? 'Uploading…'
                      : imageUrl
                        ? 'Ready to send'
                        : 'Upload failed'}
                  </span>
                </div>
              </div>
            ) : (
              <label
                className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  imageDragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-surface-2'
                }`}
              >
                <svg className='text-neutral mb-1 h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M12 4v16m8-8H4' />
                </svg>
                <span className='text-neutral text-xs'>
                  {imageDragOver ? 'Drop image here' : 'Click or drop JPEG / PNG (max 2 MB)'}
                </span>
                <input
                  ref={imageInputRef}
                  type='file'
                  accept='image/jpeg,image/png'
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageSelect(file)
                    if (imageInputRef.current) imageInputRef.current.value = ''
                  }}
                  className='sr-only'
                />
              </label>
            )}
          </div>
          {imageError && <div className='text-error mt-2 text-xs'>{imageError}</div>}
        </div>

        <div className='mb-4'>
          <label className='mb-2 block text-sm font-medium'>Audience</label>
          <div className='flex flex-col gap-2 text-sm'>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='audience'
                checked={audienceType === 'everyone'}
                onChange={() => changeAudienceType('everyone')}
              />
              Everyone
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='audience'
                checked={audienceType === 'specific'}
                onChange={() => changeAudienceType('specific')}
              />
              Specific user(s)
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='audience'
                checked={audienceType === 'unsubscribed'}
                onChange={() => changeAudienceType('unsubscribed')}
              />
              Unsubscribed users
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='audience'
                checked={audienceType === 'tiers'}
                onChange={() => changeAudienceType('tiers')}
              />
              Subscription tiers
            </label>
          </div>

          {audienceType === 'tiers' && (
            <div className='mt-3 rounded-lg border border-dashed p-3'>
              <div className='flex flex-wrap gap-4 text-sm'>
                {TIER_IDS.map((tid) => {
                  const checked = selectedTiers.includes(tid)
                  return (
                    <label key={tid} className='flex items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={checked}
                        onChange={(e) => {
                          setSelectedTiers(
                            e.target.checked
                              ? [...selectedTiers, tid].sort((a, b) => a - b) as TierId[]
                              : selectedTiers.filter((t) => t !== tid)
                          )
                          resetPreview()
                        }}
                      />
                      {TIER_LABELS[tid]}
                    </label>
                  )
                })}
              </div>
              {selectedTiers.length === 0 && (
                <div className='text-neutral mt-2 text-xs'>Select at least one tier to send.</div>
              )}
            </div>
          )}

          {audienceType === 'specific' && (
            <div className='mt-3 rounded-lg border border-dashed p-3'>
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={specificInput}
                  onChange={(e) => {
                    setSpecificInput(e.target.value)
                    if (addError) setAddError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addChip()
                    }
                  }}
                  placeholder='0x… address or name.eth'
                  className='flex-1'
                  disabled={resolving}
                />
                <button
                  type='button'
                  onClick={addChip}
                  disabled={resolving || !specificInput.trim()}
                  className='btn btn-secondary'
                >
                  {resolving ? 'Resolving…' : 'Add'}
                </button>
              </div>
              {addError && <div className='text-error mt-2 text-xs'>{addError}</div>}
              {chips.length > 0 && (
                <div className='mt-3 flex flex-wrap gap-2'>
                  {chips.map((chip) => (
                    <span
                      key={chip.address}
                      className='inline-flex items-center gap-1 rounded-full bg-[var(--tertiary)] px-3 py-1 text-xs'
                    >
                      <span className='font-mono'>{chip.label}</span>
                      <button
                        type='button'
                        onClick={() => removeChip(chip.address)}
                        className='text-neutral hover:text-error ml-1'
                        aria-label={`Remove ${chip.label}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {chips.length === 0 && !addError && (
                <div className='text-neutral mt-2 text-xs'>Add at least one recipient to send.</div>
              )}
            </div>
          )}
        </div>

        <div className='mb-4'>
          <label className='mb-2 block text-sm font-medium'>Channels</label>
          <div className='flex flex-col gap-2 text-sm'>
            <label className='flex items-center gap-2'>
              <input type='checkbox' checked disabled />
              In-app (always on)
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={email}
                onChange={(e) => {
                  setEmail(e.target.checked)
                  resetPreview()
                }}
              />
              Email (verified addresses only)
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={telegram}
                onChange={(e) => {
                  setTelegram(e.target.checked)
                  resetPreview()
                }}
              />
              Telegram (linked chats only)
            </label>
          </div>
        </div>

        {preview && (
          <div className='mb-4 rounded-lg border border-dashed p-3 text-sm'>
            Would reach <b>{preview.total}</b> user{preview.total === 1 ? '' : 's'}. Email: <b>{preview.email}</b>,
            Telegram: <b>{preview.telegram}</b>.
          </div>
        )}

        <div className='flex flex-wrap gap-2'>
          <button
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || !audienceValid}
            className='btn btn-secondary'
          >
            {previewMutation.isPending ? 'Checking…' : 'Preview recipients'}
          </button>
          <button
            onClick={() => testMutation.mutate()}
            disabled={!canCompose || testMutation.isPending}
            className='btn btn-secondary'
          >
            {testMutation.isPending ? 'Sending…' : 'Send test to me'}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canCompose || broadcastMutation.isPending}
            className='btn btn-primary ml-auto'
          >
            Send broadcast
          </button>
        </div>
      </div>

      <div className='card overflow-hidden p-0'>
        <div className='flex items-center justify-between px-6 pb-4 pt-6'>
          <h2 className='text-lg font-semibold'>History</h2>
          <button onClick={() => history.refetch()} className='btn btn-secondary'>
            Refresh
          </button>
        </div>
        <div className='overflow-x-auto'>
          <table>
            <thead>
              <tr>
                <th>Sent</th>
                <th>Sent by</th>
                <th>Title</th>
                <th>Channels</th>
                <th>Recipients</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr key={b.id}>
                  <td className='whitespace-nowrap'>{formatDate(b.created_at)}</td>
                  <td className='font-mono text-xs'>
                    {b.sent_by_address ? `${b.sent_by_address.slice(0, 6)}…${b.sent_by_address.slice(-4)}` : '—'}
                  </td>
                  <td>
                    {b.title}
                    {b.is_test && (
                      <span className='ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'>
                        test
                      </span>
                    )}
                  </td>
                  <td className='text-xs'>{(b.channels || []).join(', ')}</td>
                  <td>{b.recipient_count}</td>
                </tr>
              ))}
              {broadcasts.length === 0 && !history.isLoading && (
                <tr>
                  <td colSpan={5} className='text-neutral py-6 text-center text-sm'>
                    No broadcasts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => broadcastMutation.mutate()}
        isLoading={broadcastMutation.isPending}
        title='Send broadcast?'
        variant='warning'
        confirmText='Send'
        message={
          <div className='space-y-2 text-left'>
            <div>
              {audience.type === 'everyone' && (
                <>
                  This will notify <b>all users</b> via <b>{channels.join(', ')}</b>.
                </>
              )}
              {audience.type === 'specific' && (
                <>
                  This will notify <b>{audience.addresses.length}</b> user
                  {audience.addresses.length === 1 ? '' : 's'} via <b>{channels.join(', ')}</b>.
                </>
              )}
              {audience.type === 'unsubscribed' && (
                <>
                  This will notify <b>unsubscribed users</b> via <b>{channels.join(', ')}</b>.
                </>
              )}
              {audience.type === 'tiers' && (
                <>
                  This will notify subscribers at{' '}
                  <b>{audience.tierIds.map((t) => TIER_LABELS[t]).join(', ')}</b> via{' '}
                  <b>{channels.join(', ')}</b>.
                </>
              )}
            </div>
            {preview ? (
              <div>
                Recipient count: <b>{preview.total}</b>
              </div>
            ) : (
              <div className='text-neutral text-xs'>
                Tip: click &ldquo;Preview recipients&rdquo; first to see the exact count.
              </div>
            )}
          </div>
        }
      />
    </div>
  )
}
