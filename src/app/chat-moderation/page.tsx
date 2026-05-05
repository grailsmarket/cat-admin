'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { lookupChatUser } from '@/api/chat-moderation'

export default function ChatModerationPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const res = await lookupChatUser(q)
      if (!res.success || !res.data) {
        toast.error(res.error?.message ?? 'User not found')
        return
      }
      router.push(`/chat-moderation/users/${res.data.user.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>Chat Moderation</h1>
        <p className='text-neutral mt-1 text-sm'>
          Look up a user by address or .eth name to view their chat activity, ban them
          from messaging, or delete all of their messages.
        </p>
      </div>

      <form onSubmit={handleLookup} className='card max-w-xl space-y-3'>
        <label className='text-neutral block text-xs'>Address or ENS name</label>
        <input
          type='text'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='0x… or someone.eth'
          className='border-border bg-tertiary placeholder:text-neutral focus:border-primary w-full rounded-lg border px-3 py-2 text-sm focus:outline-none'
          autoFocus
        />
        <button
          type='submit'
          disabled={loading || !query.trim()}
          className='btn btn-primary'
        >
          {loading ? 'Looking up…' : 'Look up user'}
        </button>
      </form>
    </div>
  )
}
