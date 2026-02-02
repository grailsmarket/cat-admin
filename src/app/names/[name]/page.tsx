'use client'

import { useState, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchEnsName, removeCategoriesFromName } from '@/api/names'
import { fetchCategories, addNames, type AddNamesResponse } from '@/api/categories'

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
    addMutation.mutate(selectedCategoryToAdd)
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

  const handleRemoveSelected = () => {
    if (selectedCategories.size === 0) return
    setError(null)
    removeMutation.mutate(Array.from(selectedCategories))
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
  const hasListing = ensName.listings && ensName.listings.length > 0
  const activeListing = hasListing ? ensName.listings[0] : null

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

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Left column - Name details */}
        <div className='space-y-6 lg:col-span-1'>
          {/* Core Details */}
          <div className='card'>
            <h2 className='mb-4 text-lg font-semibold'>Details</h2>
            <div className='space-y-4 text-sm'>
              <div>
                <p className='text-neutral'>Name</p>
                <p className='font-mono'>{ensName.name}</p>
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
                      href={`https://etherscan.io/address/${ensName.owner}`}
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

          {/* Market Data */}
          <div className='card'>
            <h2 className='mb-4 text-lg font-semibold'>Market</h2>
            <div className='space-y-4 text-sm'>
              <div>
                <p className='text-neutral'>Listed For</p>
                <p className={activeListing ? 'text-success font-semibold' : ''}>
                  {activeListing ? formatEth(activeListing.price_wei) : 'Not listed'}
                </p>
              </div>
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
            </div>
          </div>

          {/* Active Listings */}
          {ensName.listings && ensName.listings.length > 0 && (
            <div className='card'>
              <h2 className='mb-4 text-lg font-semibold'>
                Active Listings ({ensName.listings.length})
              </h2>
              <div className='space-y-3'>
                {ensName.listings.map((listing, idx) => (
                  <div key={listing.id || idx} className='bg-tertiary rounded-lg p-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='text-success font-semibold'>{formatEth(listing.price_wei)}</p>
                        <p className='text-neutral text-xs'>
                          Source: {listing.source || 'Unknown'}
                        </p>
                      </div>
                      <div className='text-right text-xs'>
                        <p className='text-neutral'>Expires</p>
                        <p>{formatDate(listing.expires_at)}</p>
                      </div>
                    </div>
                    <p className='text-neutral mt-2 break-all text-xs'>
                      Seller: {listing.seller_address}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Engagement */}
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
        </div>

        {/* Right column - Categories */}
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
                  <select
                    value={selectedCategoryToAdd}
                    onChange={(e) => setSelectedCategoryToAdd(e.target.value)}
                    className='flex-1'
                    disabled={addMutation.isPending}
                  >
                    <option value=''>Choose a category...</option>
                    {allCategories
                      .filter((cat) => !clubs.includes(cat.name))
                      .map((cat) => (
                        <option key={cat.name} value={cat.name}>
                          {cat.name} ({cat.name_count ?? 0} names)
                        </option>
                      ))}
                  </select>
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
                      <th className='w-20'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((categoryName) => (
                      <tr
                        key={categoryName}
                        className={selectedCategories.has(categoryName) ? 'bg-primary/5' : ''}
                      >
                        <td>
                          <input
                            type='checkbox'
                            checked={selectedCategories.has(categoryName)}
                            onChange={() => toggleCategory(categoryName)}
                            className='rounded'
                          />
                        </td>
                        <td>
                          <span className='font-medium'>{categoryName}</span>
                        </td>
                        <td>
                          <Link
                            href={`/categories/${encodeURIComponent(categoryName)}`}
                            className='text-neutral hover:text-primary'
                          >
                            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d='M9 5l7 7-7 7'
                              />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
