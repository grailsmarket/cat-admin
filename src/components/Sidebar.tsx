'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useUserContext } from '@/context/user'
import { useEnsName, useEnsAvatar } from 'wagmi'
import { mainnet } from 'wagmi/chains'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { userAddress, handleSignOut } = useUserContext()
  const [quickSearch, setQuickSearch] = useState('')

  // Fetch ENS name and avatar
  const { data: ensName } = useEnsName({
    address: userAddress as `0x${string}` | undefined,
    chainId: mainnet.id,
  })
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
  })

  const isActive = (path: string) => {
    return pathname.startsWith(path)
  }

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (quickSearch.trim()) {
      const name = quickSearch.trim().endsWith('.eth') 
        ? quickSearch.trim() 
        : `${quickSearch.trim()}.eth`
      router.push(`/names/${encodeURIComponent(name)}`)
      setQuickSearch('')
    }
  }

  return (
    <aside className='bg-secondary border-border sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col border-r'>
      {/* Logo */}
      <div className='border-border border-b p-6'>
        <div className='flex items-center gap-3'>
          <Image
            src='/logo.png'
            alt='Cat Admin'
            width={48}
            height={48}
            className='h-12 w-12'
            priority
            unoptimized
          />
          <div>
            <h1 className='text-xl font-bold'>Cat Admin</h1>
            <p className='text-neutral text-sm'>Grails Category Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className='flex flex-1 flex-col p-4'>
        {/* Quick search bar */}
        <form onSubmit={handleQuickSearch} className='mb-4'>
          <input
            type='text'
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder='Quick name search...'
            className='w-full rounded-lg border border-border bg-tertiary px-3 py-2 text-sm placeholder:text-neutral focus:border-primary focus:outline-none'
          />
        </form>

        <ul className='space-y-1'>
          <li>
            {/* Parent: Categories */}
            <div
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                pathname === '/categories' || pathname.startsWith('/categories/')
                  ? 'text-primary'
                  : 'text-foreground'
              }`}
            >
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
                />
              </svg>
              Categories
            </div>
            {/* Sub-nav: View Categories */}
            <Link
              href='/categories'
              className={`ml-4 flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-colors ${
                pathname === '/categories'
                  ? 'text-primary font-medium'
                  : 'text-neutral hover:text-foreground'
              }`}
            >
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M4 6h16M4 10h16M4 14h16M4 18h16'
                />
              </svg>
              View Categories
            </Link>
            {/* Sub-nav: New Category */}
            <Link
              href='/categories/new'
              className={`ml-4 flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-colors ${
                pathname === '/categories/new'
                  ? 'text-primary font-medium'
                  : 'text-neutral hover:text-foreground'
              }`}
            >
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              New Category
            </Link>
          </li>
          <li>
            <Link
              href='/names'
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive('/names')
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-tertiary'
              }`}
            >
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                />
              </svg>
              Name Lookup
            </Link>
          </li>
        </ul>

        {/* Activity Log - pinned to bottom */}
        <div className='mt-auto pt-4'>
          <Link
            href='/activity'
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              isActive('/activity')
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-tertiary'
            }`}
          >
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
            Activity Log
          </Link>
        </div>
      </nav>

      {/* User section */}
      <div className='border-border border-t p-4'>
        <div className='mb-3 flex items-center gap-3'>
          {/* Avatar */}
          <div className='relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-tertiary'>
            {ensAvatar ? (
              <Image
                src={ensAvatar}
                alt={ensName || 'Avatar'}
                fill
                className='object-cover'
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center text-neutral text-lg font-bold'>
                {userAddress?.slice(2, 4).toUpperCase()}
              </div>
            )}
          </div>
          {/* Name/Address */}
          <div className='min-w-0 flex-1'>
            <p className='text-neutral text-xs'>Connected as</p>
            {ensName ? (
              <p className='truncate text-sm font-medium'>{ensName}</p>
            ) : (
              <p className='truncate font-mono text-sm'>
                {userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className='text-neutral hover:text-error flex w-full items-center gap-2 text-sm transition-colors'
        >
          <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
            />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  )
}

