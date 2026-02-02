'use client'

import Sidebar from './Sidebar'
import AdminGate from './AdminGate'

type Props = {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: Props) {
  return (
    <AdminGate>
      <div className='flex min-h-screen'>
        <Sidebar />
        <main className='flex-1 overflow-auto'>{children}</main>
      </div>
    </AdminGate>
  )
}

