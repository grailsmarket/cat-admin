'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchCategory, updateCategory, addMembers, removeMembers } from '@/api/categories'

type PageProps = {
  params: Promise<{ name: string }>
}

export default function CategoryDetailPage({ params }: PageProps) {
  const { name } = use(params)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [description, setDescription] = useState('')
  const [newNames, setNewNames] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [memberSearch, setMemberSearch] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const { data, isLoading, error: fetchError } = useQuery({
    queryKey: ['category', name, page],
    queryFn: () => fetchCategory(name, page, 50),
  })

  const category = data?.data

  // Update description mutation
  const updateMutation = useMutation({
    mutationFn: () => updateCategory(name, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category', name] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setIsEditing(false)
      showSuccess('Description updated successfully')
    },
    onError: (err: Error) => setError(err.message),
  })

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: (names: string[]) => addMembers(name, names),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        setNewNames('')
        setShowAddForm(false)
        showSuccess(`Added ${result.added} member(s)${result.skipped ? `, skipped ${result.skipped} existing` : ''}`)
      } else {
        if (result.invalidNames && result.invalidNames.length > 0) {
          setError(`Invalid ENS names: ${result.invalidNames.slice(0, 5).join(', ')}${result.invalidNames.length > 5 ? ` and ${result.invalidNames.length - 5} more` : ''}`)
        } else {
          setError(result.error || 'Failed to add members')
        }
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  // Remove members mutation
  const removeMembersMutation = useMutation({
    mutationFn: (names: string[]) => removeMembers(name, names),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        setSelectedMembers(new Set())
        showSuccess(`Removed ${result.removed} member(s)`)
      } else {
        setError(result.error || 'Failed to remove members')
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const handleStartEdit = () => {
    setDescription(category?.description || '')
    setIsEditing(true)
    setError('')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setDescription('')
  }

  const handleSaveDescription = () => {
    updateMutation.mutate()
  }

  const handleAddMembers = () => {
    setError('')
    const names = newNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)

    if (names.length === 0) {
      setError('Please enter at least one ENS name')
      return
    }

    addMembersMutation.mutate(names)
  }

  const handleRemoveSelected = () => {
    if (selectedMembers.size === 0) return
    setError('')
    removeMembersMutation.mutate(Array.from(selectedMembers))
  }

  const toggleMember = (ensName: string) => {
    const newSelected = new Set(selectedMembers)
    if (newSelected.has(ensName)) {
      newSelected.delete(ensName)
    } else {
      newSelected.add(ensName)
    }
    setSelectedMembers(newSelected)
  }

  const toggleAllMembers = () => {
    if (!category?.members) return
    if (selectedMembers.size === category.members.length) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(category.members.map((m) => m.ens_name)))
    }
  }

  const filteredMembers = category?.members?.filter((m) =>
    m.ens_name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const nameCount = newNames
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0).length

  if (isLoading) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
      </div>
    )
  }

  if (fetchError || !category) {
    return (
      <div className='p-8'>
        <Link href='/categories' className='text-neutral hover:text-primary mb-4 inline-flex items-center gap-1 text-sm'>
          <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
          </svg>
          Back to Categories
        </Link>
        <div className='card bg-error/10 border-error'>
          <h2 className='text-error text-lg font-semibold'>Category Not Found</h2>
          <p className='text-neutral mt-1'>The category &quot;{name}&quot; does not exist or could not be loaded.</p>
        </div>
      </div>
    )
  }

  return (
    <div className='p-8'>
      {/* Header */}
      <div className='mb-8'>
        <Link href='/categories' className='text-neutral hover:text-primary mb-4 inline-flex items-center gap-1 text-sm'>
          <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
          </svg>
          Back to Categories
        </Link>
        <h1 className='text-3xl font-bold'>{category.name}</h1>
        <p className='text-neutral mt-1'>
          {category.member_count.toLocaleString()} member{category.member_count !== 1 ? 's' : ''} • 
          Created {formatDate(category.created_at)}
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
            <button onClick={() => setError('')} className='text-error hover:text-error/70'>
              <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Left column - Category details */}
        <div className='lg:col-span-1'>
          <div className='card'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Details</h2>
              {!isEditing && (
                <button onClick={handleStartEdit} className='text-primary hover:underline text-sm'>
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div>
                <label className='mb-2 block text-sm font-medium'>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className='mb-4 w-full resize-none'
                  placeholder='Enter description...'
                />
                <div className='flex gap-2'>
                  <button
                    onClick={handleSaveDescription}
                    className='btn btn-primary text-sm'
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancelEdit} className='btn btn-secondary text-sm'>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className='text-neutral text-sm'>Description</p>
                <p className='mt-1'>{category.description || <span className='text-neutral italic'>No description</span>}</p>
              </div>
            )}

            <div className='border-border mt-6 border-t pt-6'>
              <div className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <p className='text-neutral'>Members</p>
                  <p className='text-xl font-bold'>{category.member_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className='text-neutral'>Last Updated</p>
                  <p>{formatDate(category.updated_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Members */}
        <div className='lg:col-span-2'>
          <div className='card'>
            {/* Members header */}
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
              <h2 className='text-lg font-semibold'>Members</h2>
              <div className='flex items-center gap-2'>
                {selectedMembers.size > 0 && (
                  <button
                    onClick={handleRemoveSelected}
                    className='btn btn-danger text-sm'
                    disabled={removeMembersMutation.isPending}
                  >
                    {removeMembersMutation.isPending ? 'Removing...' : `Remove ${selectedMembers.size} Selected`}
                  </button>
                )}
                <button onClick={() => setShowAddForm(!showAddForm)} className='btn btn-primary text-sm'>
                  {showAddForm ? 'Cancel' : 'Add Members'}
                </button>
              </div>
            </div>

            {/* Add members form */}
            {showAddForm && (
              <div className='bg-secondary mb-6 rounded-lg p-4'>
                <label className='mb-2 block text-sm font-medium'>
                  Add ENS Names {nameCount > 0 && <span className='text-neutral'>({nameCount} names)</span>}
                </label>
                <textarea
                  value={newNames}
                  onChange={(e) => setNewNames(e.target.value)}
                  placeholder={'vitalik.eth\nnick.eth\nbrantly.eth'}
                  rows={6}
                  className='mb-4 w-full font-mono text-sm'
                />
                <div className='flex items-center justify-between'>
                  <p className='text-neutral text-sm'>Enter one ENS name per line</p>
                  <button
                    onClick={handleAddMembers}
                    className='btn btn-primary text-sm'
                    disabled={addMembersMutation.isPending || nameCount === 0}
                  >
                    {addMembersMutation.isPending ? 'Adding...' : 'Add Names'}
                  </button>
                </div>
              </div>
            )}

            {/* Members search */}
            {category.members && category.members.length > 0 && (
              <div className='relative mb-4'>
                <svg
                  className='text-neutral absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
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
                  type='text'
                  placeholder='Search members...'
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className='w-full pl-10 text-sm'
                />
              </div>
            )}

            {/* Members list */}
            {(!category.members || category.members.length === 0) && (
              <div className='py-8 text-center'>
                <p className='text-neutral'>No members in this category yet.</p>
                {!showAddForm && (
                  <button onClick={() => setShowAddForm(true)} className='text-primary hover:underline mt-2 text-sm'>
                    Add your first members
                  </button>
                )}
              </div>
            )}

            {filteredMembers && filteredMembers.length > 0 && (
              <>
                <div className='border-border max-h-96 overflow-y-auto rounded-lg border'>
                  <table className='min-w-full'>
                    <thead className='bg-secondary sticky top-0'>
                      <tr>
                        <th className='w-10'>
                          <input
                            type='checkbox'
                            checked={selectedMembers.size === category.members?.length && category.members.length > 0}
                            onChange={toggleAllMembers}
                            className='rounded'
                          />
                        </th>
                        <th>ENS Name</th>
                        <th>Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((member) => (
                        <tr key={member.ens_name} className={selectedMembers.has(member.ens_name) ? 'bg-primary/5' : ''}>
                          <td>
                            <input
                              type='checkbox'
                              checked={selectedMembers.has(member.ens_name)}
                              onChange={() => toggleMember(member.ens_name)}
                              className='rounded'
                            />
                          </td>
                          <td className='font-mono'>{member.ens_name}</td>
                          <td className='text-neutral text-sm'>{formatDate(member.added_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {category.pagination && category.pagination.totalPages > 1 && (
                  <div className='mt-4 flex items-center justify-between'>
                    <p className='text-neutral text-sm'>
                      Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, category.pagination.totalMembers)} of{' '}
                      {category.pagination.totalMembers.toLocaleString()}
                    </p>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className='btn btn-secondary text-sm disabled:opacity-50'
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(category.pagination.totalPages, p + 1))}
                        disabled={page === category.pagination.totalPages}
                        className='btn btn-secondary text-sm disabled:opacity-50'
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* No search results */}
            {category.members && category.members.length > 0 && filteredMembers?.length === 0 && (
              <div className='py-8 text-center'>
                <p className='text-neutral'>No members match your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

