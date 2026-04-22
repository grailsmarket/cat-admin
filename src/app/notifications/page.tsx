'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  previewNotification,
  sendTestNotification,
  sendBroadcast,
  listBroadcasts,
  uploadNotificationImage,
  type Channel,
} from '@/api/notifications'
import { ConfirmModal } from '@/components/ConfirmModal'

const IMAGE_ACCEPT = 'image/jpeg,image/png'
const IMAGE_MAX_BYTES = 2 * 1024 * 1024

function validateImageFileClient(file: File): string | null {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Only JPEG and PNG files are allowed.'
  if (file.size > IMAGE_MAX_BYTES) return 'File must be 2 MB or less.'
  return null
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function NotificationsPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [email, setEmail] = useState(true)
  const [telegram, setTelegram] = useState(true)

  const [preview, setPreview] = useState<{ total: number; email: number; telegram: number } | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const channels: Channel[] = ['in_app']
  if (email) channels.push('email')
  if (telegram) channels.push('telegram')

  const trimmedImageUrl = imageUrl.trim()
  const imageUrlError = useMemo(() => {
    if (!trimmedImageUrl) return null
    return isValidHttpUrl(trimmedImageUrl) ? null : 'Image URL must start with http:// or https://'
  }, [trimmedImageUrl])

  const payload = {
    title: title.trim(),
    body: body.trim(),
    linkUrl: linkUrl.trim() || undefined,
    imageUrl: trimmedImageUrl || undefined,
    channels,
  }
  const canCompose =
    payload.title.length > 0 && payload.body.length > 0 && channels.length >= 1 && !imageUrlError

  const history = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: () => listBroadcasts(1, 25),
  })

  const previewMutation = useMutation({
    mutationFn: () => previewNotification({ channels }),
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
    mutationFn: () => sendTestNotification(payload),
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
        setImageUrl('')
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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadNotificationImage(file),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setImageUrl(res.data.imageUrl)
        setFlash(null)
      } else {
        setFlash({ kind: 'error', text: res.error || 'Image upload failed' })
      }
    },
    onError: () => setFlash({ kind: 'error', text: 'Image upload request failed' }),
  })

  const handleImageFileSelect = (file: File) => {
    const clientError = validateImageFileClient(file)
    if (clientError) {
      setFlash({ kind: 'error', text: clientError })
      return
    }
    uploadMutation.mutate(file)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const broadcasts = history.data?.data?.broadcasts ?? []

  return (
    <div className='p-4 lg:p-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Notifications</h1>
        <p className='text-neutral mt-2 text-sm'>
          Send custom announcements to all users via in-app, email, and/or Telegram.
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
          <div className='flex gap-2'>
            <input
              type='url'
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder='https://... or upload a file'
              className={`flex-1 ${imageUrlError ? 'border-error' : ''}`}
              disabled={uploadMutation.isPending}
            />
            <label
              className={`btn btn-secondary shrink-0 ${
                uploadMutation.isPending ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              }`}
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
              <input
                ref={imageInputRef}
                type='file'
                accept={IMAGE_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageFileSelect(file)
                  if (imageInputRef.current) imageInputRef.current.value = ''
                }}
                className='sr-only'
                disabled={uploadMutation.isPending}
              />
            </label>
          </div>
          {imageUrlError ? (
            <p className='text-error mt-1 text-xs'>{imageUrlError}</p>
          ) : (
            <p className='text-neutral mt-1 text-xs'>JPEG or PNG, 2 MB max.</p>
          )}
          {trimmedImageUrl && !imageUrlError && (
            <div className='border-border relative mt-2 inline-block max-w-full overflow-hidden rounded-lg border'>
              <img
                src={trimmedImageUrl}
                alt='Notification image preview'
                className='block max-h-40 max-w-full object-contain'
              />
              <button
                type='button'
                onClick={() => setImageUrl('')}
                aria-label='Remove image'
                className='absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black'
              >
                <svg
                  className='h-3 w-3'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  strokeWidth={3}
                >
                  <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
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
                  setPreview(null)
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
                  setPreview(null)
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
            disabled={previewMutation.isPending}
            className='btn btn-secondary'
          >
            {previewMutation.isPending ? 'Checking…' : 'Preview recipients'}
          </button>
          <button
            onClick={() => testMutation.mutate()}
            disabled={!canCompose || testMutation.isPending || uploadMutation.isPending}
            className='btn btn-secondary'
          >
            {testMutation.isPending ? 'Sending…' : 'Send test to me'}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canCompose || broadcastMutation.isPending || uploadMutation.isPending}
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
              This will notify all users via <b>{channels.join(', ')}</b>.
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
