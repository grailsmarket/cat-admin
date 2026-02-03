'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createCategory, addNames, fetchCategories, type CreateCategoryResponse } from '@/api/categories'
import { normalizeEnsName } from '@/lib/normalize'
import { ConfirmModal } from '@/components/ConfirmModal'

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
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  
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
  
  // TODO: Re-enable duplicate check after testing
  // const isSlugDuplicate = slug.length > 0 && existingCategorySlugs.has(slug.toLowerCase())
  const isSlugDuplicate = false

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

      // Then add initial names if provided (use normalized names)
      const validNames = parsedNames
        .filter(n => n.isValid && n.normalized)
        .map(n => n.normalized as string)

      if (validNames.length > 0) {
        const addResult = await addNames(slug, validNames)
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

    // Show confirmation modal
    setShowConfirmModal(true)
  }

  const handleConfirmCreate = () => {
    setShowConfirmModal(false)
    createMutation.mutate()
  }

  // Parse and validate ENS names (strict mode - must be already normalized)
  const parsedNames = useMemo(() => {
    const lines = initialNames.split('\n').map((n) => n.trim()).filter((n) => n.length > 0)
    return lines.map(name => {
      // Check for invalid TLDs (only .eth or no TLD allowed)
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex !== -1) {
        const tld = name.slice(dotIndex)
        if (tld !== '.eth') {
          return {
            original: name,
            normalized: null,
            isValid: false,
            reason: `invalid TLD "${tld}" - only .eth is allowed`
          }
        }
      }
      
      // Add .eth if missing
      const fullName = name.endsWith('.eth') ? name : `${name}.eth`
      const normalized = normalizeEnsName(fullName)
      // Strict: name must equal its normalized form (no uppercase, etc.)
      const isValid = normalized !== null && normalized === fullName
      return {
        original: name,
        normalized,
        isValid,
        reason: normalized === null 
          ? 'invalid ENS name' 
          : normalized !== fullName 
            ? `must be lowercase: ${normalized.replace('.eth', '')}` 
            : null
      }
    })
  }, [initialNames])
  
  const nameCount = parsedNames.length
  const invalidNames = parsedNames.filter(n => !n.isValid)
  const hasInvalidNames = invalidNames.length > 0

  return (
    <div className='p-8'>
      {/* Header */}
      <div className='mx-auto mb-8 max-w-2xl'>
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

          {/* CSV Upload */}
          <div className='mb-4'>
            <label className='mb-2 block text-sm font-medium'>Upload CSV</label>
            <div className='flex items-center gap-3'>
              <input
                type='file'
                accept='.csv,.txt'
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    const content = event.target?.result as string
                    if (content) {
                      // Parse CSV: handle comma-separated, newline-separated, or single column
                      const names = content
                        .split(/[\n,]/)
                        .map(n => n.trim().replace(/^["']|["']$/g, '')) // Remove quotes
                        .filter(n => n.length > 0 && !n.toLowerCase().includes('name')) // Skip headers
                      const newNames = names.join('\n')
                      setInitialNames(prev => prev ? `${prev}\n${newNames}` : newNames)
                    }
                  }
                  reader.readAsText(file)
                  e.target.value = '' // Reset to allow re-upload
                }}
                className='text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary/80 file:cursor-pointer'
                disabled={createMutation.isPending || !isSlugValid}
              />
              <span className='text-neutral text-xs'>CSV or TXT with one name per line or comma-separated</span>
            </div>
          </div>

          <div>
            <div className='flex items-center justify-between mb-2'>
              <label htmlFor='names' className='block text-sm font-medium'>
                ENS Names {nameCount > 0 && (
                  <span className={hasInvalidNames ? 'text-error' : 'text-neutral'}>
                    ({nameCount} names{hasInvalidNames ? `, ${invalidNames.length} invalid` : ''})
                  </span>
                )}
              </label>
              {nameCount > 0 && (
                <button
                  type='button'
                  onClick={() => setInitialNames('')}
                  className='text-xs text-neutral hover:text-error'
                  disabled={createMutation.isPending}
                >
                  Clear all
                </button>
              )}
            </div>
            <textarea
              id='names'
              value={initialNames}
              onChange={(e) => setInitialNames(e.target.value)}
              placeholder={'vitalik.eth\nnick.eth\nbrantly.eth'}
              rows={8}
              className={`w-full font-mono text-sm ${hasInvalidNames ? 'border-error' : ''}`}
              disabled={createMutation.isPending || !isSlugValid}
            />
            <p className='text-neutral mt-1 text-sm'>
              Enter one ENS name per line. The .eth suffix is optional.
            </p>
            {hasInvalidNames && (
              <div className='mt-2 rounded-lg border border-error bg-error/10 p-3'>
                <p className='text-error text-sm font-medium mb-1'>Invalid ENS names:</p>
                <ul className='text-error text-sm list-disc list-inside'>
                  {invalidNames.map((n, i) => (
                    <li key={i}>
                      <span className='font-mono'>{n.original}</span>
                      {n.reason && <span className='text-neutral ml-2'>({n.reason})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
              disabled={createMutation.isPending || !isSlugValid || hasInvalidNames}
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

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmCreate}
        title="⚠️ Create New Category"
        message={
          <div className="space-y-3">
            <p className="text-lg font-semibold text-warning">
              Are you absolutely sure you want to create this category?
            </p>
            <div className="bg-surface-2 rounded-lg p-3 space-y-1">
              <p><strong>Slug:</strong> <span className="font-mono">{slug}</span></p>
              {description && <p><strong>Description:</strong> {description}</p>}
              {nameCount > 0 && <p><strong>Initial names:</strong> {nameCount}</p>}
            </div>
            <p className="text-error font-medium">
              This action will create a new category in the production database and cannot be easily undone.
            </p>
          </div>
        }
        confirmText="Yes, Create Category"
        variant="danger"
      />
    </div>
  )
}

