'use client'

import { useUserContext } from '@/context/user'
import AdminGate from '@/components/AdminGate'

export default function CategoriesPage() {
  const { authStatus, isAdmin } = useUserContext()

  return (
    <AdminGate>
      <div className='flex-1 p-8'>
        <div className='mx-auto max-w-6xl'>
          <h1 className='mb-2 text-3xl font-bold'>Name Categories</h1>
          <p className='text-neutral mb-8'>Manage and track ENS domain name categories.</p>

          {/* Placeholder for categories list */}
          <div className='card'>
            <p className='text-neutral'>
              Categories list will be implemented in Phase 3.
              <br />
              Auth Status: {authStatus}
              <br />
              Is Admin: {isAdmin ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      </div>
    </AdminGate>
  )
}

