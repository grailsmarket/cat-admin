'use client'

import { useState, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchEnsName, removeCategoriesFromName } from '@/api/names'
import { fetchCategories, addNames, type AddNamesResponse } from '@/api/categories'
import { ConfirmModal } from '@/components/ConfirmModal'
import SearchableSelect from '@/components/SearchableSelect'
import ActivitySection from '@/components/ActivitySection'

interface PageProps {
  params: Promise<{ name: string }>
}

export default function NameDetailPage({ params }: PageProps) {
  const { name } = use(params)
  const decodedName = decodeURIComponent(name)
  const queryClient = useQueryClient()
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedCategoryToAdd, setSelectedCategoryToAdd] = useState('')
  const [showMarketDetails, setShowMarketDetails] = useState(false)

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    type: 'add' | 'remove'
    categoryName?: string
    categories?: string[]
  }>({ isOpen: false, type: 'add' })

  const { data: ensName, isLoading, error: fetchError } = useQuery({
    queryKey: ['ens-name', decodedName],
    queryFn: () => fetchEnsName(decodedName),
  })

  // Fetch all categories for the dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const allCategories = categoriesData?.data || []

  const removeMutation = useMutation({
    mutationFn: (categories: string[]) => removeCategoriesFromName(decodedName, categories),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ens-name', decodedName] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setSelectedCategories(new Set())
      showSuccess(`Removed ${data.removed} category membership(s)`)
    },
    onError: (err: Error) => setError(err.message),
  })

  const addMutation = useMutation({
    mutationFn: (categoryName: string) => addNames(categoryName, [ensName?.name || decodedName]),
    onSuccess: (result: AddNamesResponse) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['ens-name', decodedName] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        setShowAddForm(false)
        setSelectedCategoryToAdd('')
        showSuccess(`Added to category "${selectedCategoryToAdd}"`)
      } else {
        setError(result.error || 'Failed to add to category')
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleAddToCategory = () => {
    if (!selectedCategoryToAdd) return
    setError(null)
    // Show confirmation modal
    setConfirmModal({ isOpen: true, type: 'add', categoryName: selectedCategoryToAdd })
  }

  const handleRemoveSelected = () => {
    if (selectedCategories.size === 0) return
    setError(null)
    // Show confirmation modal
    setConfirmModal({ isOpen: true, type: 'remove', categories: Array.from(selectedCategories) })
  }

  const handleConfirmAction = () => {
    if (confirmModal.type === 'add' && confirmModal.categoryName) {
      addMutation.mutate(confirmModal.categoryName, {
        onSettled: () => setConfirmModal({ isOpen: false, type: 'add' }),
      })
    } else if (confirmModal.type === 'remove' && confirmModal.categories) {
      removeMutation.mutate(confirmModal.categories, {
        onSettled: () => setConfirmModal({ isOpen: false, type: 'remove' }),
      })
    }
  }

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatEth = (weiString: string | null) => {
    if (!weiString) return '—'
    const eth = Number(weiString) / 1e18
    return `${eth.toFixed(4)} ETH`
  }


  if (isLoading) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
      </div>
    )
  }

  if (fetchError || !ensName) {
    return (
      <div className='p-8'>
        <Link href='/names' className='text-neutral hover:text-primary mb-4 inline-flex items-center gap-1 text-sm'>
          <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
          </svg>
          Back to Search
        </Link>
        <div className='card bg-error/10 border-error'>
          <h2 className='text-error text-lg font-semibold'>Name Not Found</h2>
          <p className='text-neutral mt-1'>
            {(fetchError as Error)?.message || `The name "${decodedName}" does not exist or could not be loaded.`}
          </p>
        </div>
      </div>
    )
  }

  const clubs = ensName.clubs || []
  const listings = ensName.listings || []
  const hasListing = listings.length > 0
  const activeListing = hasListing ? listings[0] : null

  return (
    <div className='p-8'>
      {/* Header */}
      <div className='mb-8'>
        <Link href='/names' className='text-neutral hover:text-primary mb-4 inline-flex items-center gap-1 text-sm'>
          <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
          </svg>
          Back to Search
        </Link>
        <div className='flex items-center gap-3'>
          <h1 className='text-3xl font-bold'>{ensName.name}</h1>
          {ensName.has_emoji && (
            <span className='bg-tertiary rounded-full px-2 py-1 text-xs'>Has Emoji</span>
          )}
          {ensName.has_numbers && (
            <span className='bg-tertiary rounded-full px-2 py-1 text-xs'>Has Numbers</span>
          )}
        </div>
        <p className='text-neutral mt-1'>
          Member of {clubs.length} {clubs.length === 1 ? 'category' : 'categories'}
        </p>
      </div>

      {/* Warning for local-only names (invalid ENS names that exist in categories) */}
      {ensName._localOnly && (
        <div className='bg-warning/10 border-warning mb-6 rounded-lg border p-4'>
          <div className='flex items-start gap-3'>
            <svg className='h-5 w-5 text-warning flex-shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
            <div>
              <p className='text-warning font-medium'>Invalid or Unrecognized ENS Name</p>
              <p className='text-neutral text-sm mt-1'>
                This name is not a valid ENS name (may be too short, expired, or malformed), but it exists in your categories. 
                You can remove it from categories below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div className='bg-success/10 border-success mb-6 rounded-lg border p-4'>
          <p className='text-success'>{successMessage}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className='bg-error/10 border-error mb-6 rounded-lg border p-4'>
          <div className='flex items-start justify-between'>
            <p className='text-error'>{error}</p>
            <button onClick={() => setError(null)} className='text-error hover:text-error/70'>
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${ensName._localOnly ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {/* Left column - Name details */}
        <div className='space-y-6 lg:col-span-1'>
          {/* Core Details */}
          <div className='card'>
            <h2 className='mb-4 text-lg font-semibold'>Details</h2>
            <div className='space-y-4 text-sm'>
              <div>
                <p className='text-neutral'>Name</p>
                <p className='font-mono'>{ensName.name}</p>
                {!ensName._localOnly && (
                  <a
                    href={`https://grails.app/${ensName.name}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary hover:underline inline-flex items-center gap-1 text-xs mt-1'
                  >
                    View on Grails
                    <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                      />
                    </svg>
                  </a>
                )}
              </div>
              <div>
                <p className='text-neutral'>Token ID</p>
                <p className='break-all font-mono text-xs'>
                  {ensName.token_id || '—'}
                </p>
              </div>
              <div>
                <p className='text-neutral'>Owner</p>
                <p className='break-all font-mono text-xs'>
                  {ensName.owner ? (
                    <a
                      href={`https://grails.app/profile/${ensName.owner}`}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-primary hover:underline'
                    >
                      {ensName.owner}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div className='border-border border-t pt-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <p className='text-neutral'>Registered</p>
                    <p>{formatDate(ensName.registration_date)}</p>
                  </div>
                  <div>
                    <p className='text-neutral'>Expires</p>
                    <p>{formatDate(ensName.expiry_date)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Market Data - Collapsible (hide for local-only names) */}
          {!ensName._localOnly && (
            <div className='card'>
              <button
                onClick={() => setShowMarketDetails(!showMarketDetails)}
                className='flex w-full items-center justify-between text-left'
              >
                <h2 className='text-lg font-semibold'>Market</h2>
                <svg
                  className={`h-5 w-5 text-neutral transition-transform ${showMarketDetails ? 'rotate-180' : ''}`}
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                </svg>
              </button>
              {/* Summary - always visible */}
              <div className='mt-3 flex items-center gap-4 text-sm'>
                <div>
                  <span className='text-neutral'>Listed: </span>
                  <span className={activeListing ? 'text-success font-semibold' : ''}>
                    {activeListing ? formatEth(activeListing.price_wei || activeListing.price) : 'No'}
                  </span>
                </div>
                {ensName.last_sale_price && (
                  <div>
                    <span className='text-neutral'>Last: </span>
                    <span>{formatEth(ensName.last_sale_price)}</span>
                  </div>
                )}
              </div>
              {/* Expanded details */}
              {showMarketDetails && (
                <div className='border-border mt-4 space-y-4 border-t pt-4 text-sm'>
                  <div>
                    <p className='text-neutral'>Highest Offer</p>
                    <p>{formatEth(ensName.highest_offer_wei)}</p>
                  </div>
                  <div className='border-border border-t pt-4'>
                    <p className='text-neutral mb-2'>Last Sale</p>
                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <p className='text-neutral text-xs'>Price</p>
                        <p>
                          {formatEth(ensName.last_sale_price)}
                          {ensName.last_sale_price_usd && (
                            <span className='text-neutral ml-1 text-xs'>
                              (${parseFloat(ensName.last_sale_price_usd).toFixed(0)})
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className='text-neutral text-xs'>Date</p>
                        <p>{formatDate(ensName.last_sale_date)}</p>
                      </div>
                    </div>
                  </div>
                  {/* Active Listings */}
                  {hasListing && (
                    <div className='border-border border-t pt-4'>
                      <p className='text-neutral mb-2'>Active Listings ({listings.length})</p>
                      <div className='space-y-2'>
                        {listings.map((listing, idx) => (
                          <div key={listing.id || idx} className='bg-tertiary rounded-lg p-2'>
                            <div className='flex items-center justify-between'>
                              <div>
                                <p className='text-success font-semibold text-sm'>{formatEth(listing.price_wei || listing.price)}</p>
                                <p className='text-neutral text-xs'>
                                  {listing.source || 'Unknown'}
                                </p>
                              </div>
                              <div className='text-right text-xs'>
                                <p>{formatDate(listing.expires_at)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Engagement (hide for local-only names) */}
          {!ensName._localOnly && (
            <div className='card'>
              <h2 className='mb-4 text-lg font-semibold'>Engagement</h2>
              <div className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <p className='text-neutral'>Views</p>
                  <p className='text-xl font-bold'>{ensName.view_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className='text-neutral'>Watchers</p>
                  <p className='text-xl font-bold'>{ensName.watchers_count.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Middle column - Categories */}
        <div className='lg:col-span-2'>
          <div className='card'>
            {/* Categories header */}
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
              <h2 className='text-lg font-semibold'>Category Memberships</h2>
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className='btn btn-primary text-sm'
                >
                  {showAddForm ? 'Cancel' : 'Add to Category'}
                </button>
                {clubs.length > 0 && selectedCategories.size > 0 && (
                  <button
                    onClick={handleRemoveSelected}
                    disabled={removeMutation.isPending}
                    className='btn btn-danger text-sm disabled:opacity-50'
                  >
                    {removeMutation.isPending
                      ? 'Removing...'
                      : `Remove Selected (${selectedCategories.size})`}
                  </button>
                )}
              </div>
            </div>

            {/* Add to category form */}
            {showAddForm && (
              <div className='bg-secondary mb-6 rounded-lg p-4'>
                <label className='mb-2 block text-sm font-medium'>Select Category</label>
                <div className='flex gap-3'>
                  <SearchableSelect
                    options={allCategories
                      .filter((cat) => !clubs.includes(cat.name))
                      .map((cat) => ({
                        value: cat.name,
                        label: cat.name,
                        sublabel: `${(cat.name_count ?? 0).toLocaleString()} names`,
                      }))}
                    value={selectedCategoryToAdd}
                    onChange={setSelectedCategoryToAdd}
                    placeholder='Choose a category...'
                    disabled={addMutation.isPending}
                    className='flex-1'
                  />
                  <button
                    onClick={handleAddToCategory}
                    disabled={!selectedCategoryToAdd || addMutation.isPending}
                    className='btn btn-primary text-sm disabled:opacity-50'
                  >
                    {addMutation.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {allCategories.filter((cat) => !clubs.includes(cat.name)).length === 0 && (
                  <p className='text-neutral mt-2 text-sm'>
                    This name is already in all categories.
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            {clubs.length === 0 && !showAddForm && (
              <div className='py-8 text-center'>
                <svg
                  className='text-neutral mx-auto mb-4 h-12 w-12'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
                  />
                </svg>
                <p className='text-neutral'>This name is not a member of any categories.</p>
              </div>
            )}

            {/* Categories list */}
            {clubs.length > 0 && (
              <div className='border-border max-h-96 overflow-y-auto rounded-lg border'>
                <table className='min-w-full'>
                  <thead className='bg-secondary sticky top-0'>
                    <tr>
                      <th className='w-10'></th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((categoryName) => (
                      <tr
                        key={categoryName}
                        className={`cursor-pointer transition-colors hover:bg-tertiary ${selectedCategories.has(categoryName) ? 'bg-primary/5' : ''}`}
                        onClick={(e) => {
                          // Don't navigate if clicking on checkbox
                          if ((e.target as HTMLElement).tagName === 'INPUT') return
                          window.location.href = `/categories/${encodeURIComponent(categoryName)}`
                        }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type='checkbox'
                            checked={selectedCategories.has(categoryName)}
                            onChange={() => toggleCategory(categoryName)}
                            className='rounded'
                          />
                        </td>
                        <td>
                          <span className='font-medium text-primary'>{categoryName}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column - Activity (hide for local-only names) */}
        {!ensName._localOnly && (
          <div className='lg:col-span-1'>
            <div className='card'>
              <h2 className='mb-4 text-lg font-semibold'>Recent Activity</h2>
              <ActivitySection name={ensName.name} limit={10} />
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: 'add' })}
        onConfirm={handleConfirmAction}
        title={
          confirmModal.type === 'add'
            ? 'Add to Category'
            : 'Remove from Categories'
        }
        message={
          confirmModal.type === 'add'
            ? `Are you sure you want to add "${ensName?.name || decodedName}" to the category "${confirmModal.categoryName}"?`
            : `Are you sure you want to remove "${ensName?.name || decodedName}" from ${confirmModal.categories?.length || 0} category membership${(confirmModal.categories?.length || 0) !== 1 ? 's' : ''}? This action cannot be undone.`
        }
        confirmText={confirmModal.type === 'add' ? 'Add to Category' : 'Remove'}
        variant={confirmModal.type === 'remove' ? 'danger' : 'default'}
        isLoading={addMutation.isPending || removeMutation.isPending}
      />
    </div>
  )
}
