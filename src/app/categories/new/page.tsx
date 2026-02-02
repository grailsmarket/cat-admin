'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCategory, addMembers } from '@/api/categories'

export default function NewCategoryPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [initialNames, setInitialNames] = useState('')
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: async () => {
      // First create the category
      const result = await createCategory(name, description)
      if (!result.success) {
        throw new Error(result.error || 'Failed to create category')
      }

      // Then add initial members if provided
      const names = initialNames
        .split('\n')
        .map((n) => n.trim())
        .filter((n) => n.length > 0)

      if (names.length > 0) {
        const addResult = await addMembers(name, names)
        if (!addResult.success) {
          // Category was created but members failed
          return {
            ...result,
            memberError: addResult.error,
            invalidNames: addResult.invalidNames,
          }
        }
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if ('memberError' in result) {
        // Navigate but with a warning
        router.push(`/categories/${name}?warning=member_error`)
      } else {
        router.push(`/categories/${name}`)
      }
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate name
    if (!name) {
      setError('Name is required')
      return
    }

    const nameRegex = /^[a-z0-9_]+$/
    if (!nameRegex.test(name)) {
      setError('Name must be lowercase alphanumeric with underscores only (e.g., my_category)')
      return
    }

    createMutation.mutate()
  }

  const nameCount = initialNames
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0).length

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
        <h1 className='text-3xl font-bold'>Create New Category</h1>
        <p className='text-neutral mt-1'>Add a new category to organize ENS names.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className='max-w-2xl'>
        <div className='card mb-6'>
          <h2 className='mb-6 text-lg font-semibold'>Category Details</h2>

          {/* Name */}
          <div className='mb-6'>
            <label htmlFor='name' className='mb-2 block text-sm font-medium'>
              Name <span className='text-error'>*</span>
            </label>
            <input
              id='name'
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder='e.g., prepunks or 10k_club'
              className='w-full'
              disabled={createMutation.isPending}
            />
            <p className='text-neutral mt-1 text-sm'>
              Lowercase letters, numbers, and underscores only. This cannot be changed later.
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor='description' className='mb-2 block text-sm font-medium'>
              Description
            </label>
            <textarea
              id='description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Brief description of this category...'
              rows={3}
              className='w-full resize-none'
              disabled={createMutation.isPending}
            />
          </div>
        </div>

        {/* Initial Members */}
        <div className='card mb-6'>
          <h2 className='mb-2 text-lg font-semibold'>Initial Members</h2>
          <p className='text-neutral mb-6 text-sm'>
            Optionally add ENS names to this category. You can also add them later.
          </p>

          <div>
            <label htmlFor='names' className='mb-2 block text-sm font-medium'>
              ENS Names {nameCount > 0 && <span className='text-neutral'>({nameCount} names)</span>}
            </label>
            <textarea
              id='names'
              value={initialNames}
              onChange={(e) => setInitialNames(e.target.value)}
              placeholder={'vitalik.eth\nnick.eth\nbrantly.eth'}
              rows={8}
              className='w-full font-mono text-sm'
              disabled={createMutation.isPending}
            />
            <p className='text-neutral mt-1 text-sm'>
              Enter one ENS name per line. Names will be validated against the database.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className='bg-error/10 border-error mb-6 rounded-lg border p-4'>
            <p className='text-error'>{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className='flex items-center gap-4'>
          <button type='submit' className='btn btn-primary' disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <div className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                Creating...
              </>
            ) : (
              'Create Category'
            )}
          </button>
          <Link href='/categories' className='btn btn-secondary'>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

