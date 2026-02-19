'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import AdminGate from './AdminGate'

type Props = {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <AdminGate>
      <div className='flex min-h-screen'>
        {/* Mobile header */}
        <div className='fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b border-border bg-secondary px-4 lg:hidden'>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className='rounded-lg p-2 text-neutral hover:bg-tertiary hover:text-foreground'
            aria-label='Open menu'
          >
            <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
            </svg>
          </button>
          <span className='ml-3 text-lg font-bold'>Cat Admin</span>
        </div>

        {/* Backdrop */}
        {mobileMenuOpen && (
          <div
            className='fixed inset-0 z-40 bg-black/50 lg:hidden'
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

        {/* Main content — offset by mobile header height on small screens */}
        <main className='flex-1 overflow-auto pt-14 lg:pt-0'>{children}</main>
      </div>
    </AdminGate>
  )
}
