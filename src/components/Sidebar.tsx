'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUserContext } from '@/context/user'

export default function Sidebar() {
  const pathname = usePathname()
  const { userAddress, handleSignOut } = useUserContext()

  const isActive = (path: string) => {
    if (path === '/categories') {
      return pathname === '/categories' || pathname === '/categories/new'
    }
    return pathname.startsWith(path)
  }

  return (
    <aside className='bg-secondary border-border flex h-screen w-64 flex-col border-r'>
      {/* Logo */}
      <div className='border-border border-b p-6'>
        <h1 className='text-xl font-bold'>Cat Admin</h1>
        <p className='text-neutral text-sm'>Categories Management</p>
      </div>

      {/* Navigation */}
      <nav className='flex-1 p-4'>
        <ul className='space-y-1'>
          <li>
            <Link
              href='/categories'
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive('/categories')
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-tertiary'
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
          <li>
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
          </li>
        </ul>
      </nav>

      {/* User section */}
      <div className='border-border border-t p-4'>
        <div className='mb-3'>
          <p className='text-neutral text-xs'>Connected as</p>
          <p className='truncate font-mono text-sm'>
            {userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}
          </p>
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

