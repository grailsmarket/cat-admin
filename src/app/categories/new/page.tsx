'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createCategory, addNames, fetchCategories, type CreateCategoryResponse } from '@/api/categories'

type SlugCheckResult = {
  isLive: boolean
  checks: { avatar: boolean; header: boolean }
}

export default function NewCategoryPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [initialNames, setInitialNames] = useState('')
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState<{ 
    required?: string[]
    checks?: { avatar: boolean; header: boolean }
    checkUrls?: { avatar: string; header: string }
  } | null>(null)
  
  // Live slug check state
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  
  // Fetch existing categories to check for duplicates
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })
  
  const existingCategorySlugs = useMemo(() => {
    return new Set((categoriesData?.data || []).map(cat => cat.name.toLowerCase()))
  }, [categoriesData])
  
  const isSlugDuplicate = slug.length > 0 && existingCategorySlugs.has(slug.toLowerCase())

  // Debounced slug check
  const checkSlug = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck || slugToCheck.length < 2) {
      setSlugCheck(null)
      return
    }
    
    const slugRegex = /^[a-z0-9_]+$/
    if (!slugRegex.test(slugToCheck)) {
      setSlugCheck(null)
      return
    }
    
    setIsCheckingSlug(true)
    try {
      const response = await fetch(`/api/cats/check?slug=${encodeURIComponent(slugToCheck)}`, {
        credentials: 'include',
      })
      const data = await response.json()
      setSlugCheck({
        isLive: data.isLive,
        checks: data.checks,
      })
    } catch {
      setSlugCheck(null)
    } finally {
      setIsCheckingSlug(false)
    }
  }, [])

  // Debounce slug check (1 second)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSlug(slug)
    }, 1000)
    return () => clearTimeout(timer)
  }, [slug, checkSlug])

  // Derived state: is slug valid in grails and not a duplicate?
  const isSlugValid = slugCheck?.isLive === true && !isSlugDuplicate

  const createMutation = useMutation({
    mutationFn: async () => {
      // First create the category
      const result = await createCategory(slug, description)
      if (!result.success) {
        const error = new Error(result.error || 'Failed to create category') as Error & {
          details?: CreateCategoryResponse['details']
        }
        error.details = result.details
        throw error
      }

      // Then add initial members if provided
      const names = initialNames
        .split('\n')
        .map((n) => n.trim())
        .filter((n) => n.length > 0)

      if (names.length > 0) {
        const addResult = await addNames(slug, names)
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
        router.push(`/categories/${slug}?warning=member_error`)
      } else {
        router.push(`/categories/${slug}`)
      }
    },
    onError: (err: Error & { details?: { required?: string[]; checkUrl?: string } }) => {
      setError(err.message)
      setErrorDetails(err.details || null)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setErrorDetails(null)

    // Validate slug
    if (!slug) {
      setError('Slug is required')
      return
    }

    const slugRegex = /^[a-z0-9_]+$/
    if (!slugRegex.test(slug)) {
      setError('Slug must be lowercase alphanumeric with underscores only (e.g., my_category)')
      return
    }

    // Check if slug is ready
    if (!slugCheck?.isLive) {
      setError('Category images not found in Grails frontend. Please add images first.')
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
      <div className='mx-auto mb-8 max-w-2xl'>
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
      <form onSubmit={handleSubmit} className='mx-auto max-w-2xl'>
        <div className='card mb-6'>
          <h2 className='mb-6 text-lg font-semibold'>Category Details</h2>

          {/* Slug */}
          <div className='mb-6'>
            <label htmlFor='slug' className='mb-2 block text-sm font-medium'>
              Slug <span className='text-error'>*</span>
            </label>
            <div className='relative'>
              <input
                id='slug'
                type='text'
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder='e.g., prepunks or 10k_club'
                className='w-full pr-10'
                disabled={createMutation.isPending}
              />
              {isCheckingSlug && (
                <div className='absolute right-3 top-1/2 -translate-y-1/2'>
                  <div className='h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent' />
                </div>
              )}
            </div>
            <p className='text-neutral mt-1 text-sm'>
              Lowercase letters, numbers, and underscores only. This cannot be changed later.
            </p>
            
            {/* Live status check */}
            {slug.length >= 2 && !isCheckingSlug && slugCheck && (
              <div className='mt-3 rounded-lg border p-3' style={{ 
                borderColor: isSlugValid ? 'var(--success)' : 'var(--error)',
                backgroundColor: isSlugValid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
              }}>
                <div className='flex items-center gap-2 mb-2'>
                  {isSlugDuplicate ? (
                    <span className='text-error font-medium'>✗ Category already exists</span>
                  ) : slugCheck.isLive ? (
                    <span className='text-success font-medium'>✓ Ready to create</span>
                  ) : (
                    <span className='text-error font-medium'>✗ Not set up in Grails</span>
                  )}
                </div>
                {!isSlugDuplicate && (
                  <>
                    <div className='flex gap-4 text-sm'>
                      <span className={slugCheck.checks.avatar ? 'text-success' : 'text-error'}>
                        {slugCheck.checks.avatar ? '✓' : '✗'} Avatar
                      </span>
                      <span className={slugCheck.checks.header ? 'text-success' : 'text-error'}>
                        {slugCheck.checks.header ? '✓' : '✗'} Header
                      </span>
                    </div>
                    {!slugCheck.isLive && (
                      <p className='text-neutral text-xs mt-2'>
                        Add images to grails-app/public/clubs/{slug}/ first
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
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
              disabled={createMutation.isPending || !isSlugValid}
            />
          </div>
        </div>

        {/* Initial Names */}
        <div className='card mb-6'>
          <h2 className='mb-2 text-lg font-semibold'>Initial Names</h2>
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
              disabled={createMutation.isPending || !isSlugValid}
            />
            <p className='text-neutral mt-1 text-sm'>
              Enter one ENS name per line. Names will be validated against the database.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className='bg-error/10 border-error mb-6 rounded-lg border p-4'>
            <p className='text-error font-medium'>{error}</p>
            {errorDetails?.required && (
              <div className='mt-3'>
                {errorDetails.checks && (
                  <div className='mb-3 text-sm'>
                    <p className='text-neutral mb-1'>Image checks:</p>
                    <div className='flex gap-4'>
                      <span className={errorDetails.checks.avatar ? 'text-success' : 'text-error'}>
                        {errorDetails.checks.avatar ? '✓' : '✗'} Avatar
                      </span>
                      <span className={errorDetails.checks.header ? 'text-success' : 'text-error'}>
                        {errorDetails.checks.header ? '✓' : '✗'} Header
                      </span>
                    </div>
                  </div>
                )}
                <p className='text-neutral text-sm mb-2'>Required in grails-app:</p>
                <ul className='text-sm text-neutral list-disc list-inside space-y-1'>
                  {errorDetails.required.map((item, idx) => (
                    <li key={idx} className='font-mono text-xs'>{item}</li>
                  ))}
                </ul>
                {errorDetails.checkUrls && (
                  <div className='text-neutral text-xs mt-3 space-y-1'>
                    <p>
                      Avatar:{' '}
                      <a href={errorDetails.checkUrls.avatar} target='_blank' rel='noopener noreferrer' className='text-primary hover:underline'>
                        {errorDetails.checkUrls.avatar}
                      </a>
                    </p>
                    <p>
                      Header:{' '}
                      <a href={errorDetails.checkUrls.header} target='_blank' rel='noopener noreferrer' className='text-primary hover:underline'>
                        {errorDetails.checkUrls.header}
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className='flex flex-col gap-3'>
          {!isSlugValid && (
            <p className='text-error text-sm'>Enter a valid slug to create a new category</p>
          )}
          <div className='flex items-center gap-4'>
            <button 
              type='submit' 
              className='btn btn-primary' 
              disabled={createMutation.isPending || !isSlugValid}
            >
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
        </div>
      </form>
    </div>
  )
}

