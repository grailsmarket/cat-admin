'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizeEnsName } from '@/lib/normalize'

export default function NamesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setError('Please enter an ENS name')
      return
    }

    // Add .eth suffix if not present
    const withSuffix = trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`

    // Normalize on client side for better UX
    const normalized = normalizeEnsName(withSuffix)
    if (!normalized) {
      setError('Invalid ENS name format')
      return
    }

    // Navigate to the name detail page
    router.push(`/names/${encodeURIComponent(normalized)}`)
  }

  return (
    <div className='p-8'>
      {/* Header */}
      <div className='mx-auto mb-8 max-w-xl'>
        <h1 className='text-3xl font-bold'>Name Lookup</h1>
        <p className='text-neutral mt-1'>
          Search for an ENS name to view and manage its category memberships.
        </p>
      </div>

      {/* Search form */}
      <div className='card mx-auto max-w-xl'>
        <form onSubmit={handleSearch} className='space-y-4'>
          <div>
            <label htmlFor='search' className='mb-2 block text-sm font-medium'>
              ENS Name
            </label>
            <div className='flex gap-3'>
              <div className='relative flex-1'>
                <svg
                  className='text-neutral absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                  />
                </svg>
                <input
                  id='search'
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='e.g., vitalik or vitalik.eth'
                  className='w-full pl-10'
                />
              </div>
              <button type='submit' className='btn btn-primary'>
                Search
              </button>
            </div>
            {error && (
              <p className='text-error mt-2 text-sm'>{error}</p>
            )}
          </div>
        </form>
      </div>

      {/* Help section */}
      <div className='card mx-auto mt-8 max-w-xl'>
        <h2 className='mb-3 text-lg font-semibold'>How it works</h2>
        <ul className='text-neutral space-y-2 text-sm'>
          <li className='flex items-start gap-2'>
            <span className='text-primary'>•</span>
            Enter an ENS name (e.g., <code className='text-primary'>nick</code> or <code className='text-primary'>nick.eth</code>)
          </li>
          <li className='flex items-start gap-2'>
            <span className='text-primary'>•</span>
            View all categories the name belongs to
          </li>
          <li className='flex items-start gap-2'>
            <span className='text-primary'>•</span>
            Remove categories from the name as needed
          </li>
        </ul>
      </div>
    </div>
  )
}
