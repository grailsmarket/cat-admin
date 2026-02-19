'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createCategory, addNames, fetchCategories } from '@/api/categories'
import { normalizeEnsName } from '@/lib/normalize'
import { ConfirmModal } from '@/components/ConfirmModal'
import { VALID_CLASSIFICATIONS, CLASSIFICATION_LABELS, type Classification } from '@/constants/classifications'

export default function NewCategoryPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [initialNames, setInitialNames] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Image file state
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [headerFile, setHeaderFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [headerPreview, setHeaderPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const headerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      if (headerPreview) URL.revokeObjectURL(headerPreview)
    }
  }, [avatarPreview, headerPreview])

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const existingCategorySlugs = useMemo(() => {
    return new Set((categoriesData?.data || []).map(cat => cat.name.toLowerCase()))
  }, [categoriesData])

  const isSlugDuplicate = slug.length > 0 && existingCategorySlugs.has(slug.toLowerCase())
  const isSlugFormatValid = slug.length >= 2 && /^[a-z0-9_]+$/.test(slug)
  const isSlugValid = isSlugFormatValid && !isSlugDuplicate

  const handleFileSelect = (type: 'avatar' | 'header', file: File | null) => {
    if (!file) return

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error(`${type === 'avatar' ? 'Avatar' : 'Header'}: Only JPEG and PNG files are allowed.`)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(`${type === 'avatar' ? 'Avatar' : 'Header'}: File must be 2 MB or less.`)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    if (type === 'avatar') {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarFile(file)
      setAvatarPreview(previewUrl)
    } else {
      if (headerPreview) URL.revokeObjectURL(headerPreview)
      setHeaderFile(file)
      setHeaderPreview(previewUrl)
    }
  }

  const clearFile = (type: 'avatar' | 'header') => {
    if (type === 'avatar') {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarFile(null)
      setAvatarPreview(null)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    } else {
      if (headerPreview) URL.revokeObjectURL(headerPreview)
      setHeaderFile(null)
      setHeaderPreview(null)
      if (headerInputRef.current) headerInputRef.current.value = ''
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createCategory(slug, {
        display_name: displayName || undefined,
        description: description || undefined,
        classifications: classifications.length > 0 ? classifications : undefined,
        avatar: avatarFile || undefined,
        header: headerFile || undefined,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to create category')
      }

      const validNames = parsedNames
        .filter(n => n.isValid && n.normalized)
        .map(n => n.normalized as string)

      if (validNames.length > 0) {
        try {
          const addResult = await addNames(slug, validNames)
          if (!addResult.success) {
            return { ...result, memberError: addResult.error || 'Failed to add names' }
          }
        } catch (addError) {
          return {
            ...result,
            memberError: addError instanceof Error ? addError.message : 'Failed to add names',
          }
        }
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if ('memberError' in result) {
        router.push(`/categories/${slug}?warning=member_error`)
      } else {
        router.push(`/categories/${slug}`)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!slug) {
      toast.error('Slug is required')
      return
    }

    if (!isSlugFormatValid) {
      toast.error('Slug must be at least 2 characters, lowercase alphanumeric with underscores only')
      return
    }

    if (isSlugDuplicate) {
      toast.error('A category with this slug already exists')
      return
    }

    setShowConfirmModal(true)
  }

  const handleConfirmCreate = () => {
    setShowConfirmModal(false)
    createMutation.mutate()
  }

  const parsedNames = useMemo(() => {
    const lines = initialNames.split('\n').map((n) => n.trim()).filter((n) => n.length > 0)
    return lines.map(name => {
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex !== -1) {
        const tld = name.slice(dotIndex)
        if (tld !== '.eth') {
          return { original: name, normalized: null, isValid: false, reason: `invalid TLD "${tld}" - only .eth is allowed` }
        }
      }
      const fullName = name.endsWith('.eth') ? name : `${name}.eth`
      const normalized = normalizeEnsName(fullName)
      const isValid = normalized !== null && normalized === fullName
      return {
        original: name,
        normalized,
        isValid,
        reason: normalized === null
          ? 'invalid ENS name'
          : normalized !== fullName
            ? `must be lowercase: ${normalized.replace('.eth', '')}`
            : null,
      }
    })
  }, [initialNames])

  const nameCount = parsedNames.length
  const invalidNames = parsedNames.filter(n => !n.isValid)
  const hasInvalidNames = invalidNames.length > 0

  return (
    <div className='p-8'>
      <div className='mx-auto mb-8 max-w-2xl'>
        <h1 className='text-3xl font-bold'>Create New Category</h1>
        <p className='text-neutral mt-1'>Add a new category to organize ENS names.</p>
      </div>

      <form onSubmit={handleSubmit} className='mx-auto max-w-2xl'>
        {/* Category Details */}
        <div className='card mb-6'>
          <h2 className='mb-6 text-lg font-semibold'>Category Details</h2>

          {/* Slug */}
          <div className='mb-6'>
            <label htmlFor='slug' className='mb-2 block text-sm font-medium'>
              Slug <span className='text-error'>*</span>
            </label>
            <input
              id='slug'
              type='text'
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder='e.g., prepunks or 10k_club'
              className='w-full'
              disabled={createMutation.isPending}
            />
            <p className='text-neutral mt-1 text-sm'>
              Lowercase letters, numbers, and underscores only. This cannot be changed later.
            </p>
            {slug.length >= 2 && isSlugDuplicate && (
              <p className='text-error mt-2 text-sm font-medium'>A category with this slug already exists</p>
            )}
          </div>

          {/* Display Name — hidden until DB migration runs
          <div className='mb-6'>
            <label htmlFor='displayName' className='mb-2 block text-sm font-medium'>
              Display Name
            </label>
            <input
              id='displayName'
              type='text'
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder='e.g., 999 Club or PrePunks'
              className='w-full'
              disabled={createMutation.isPending}
            />
            <p className='text-neutral mt-1 text-sm'>
              Human-readable name shown on grails.app. Leave blank to use the slug.
            </p>
          </div> */}

          {/* Description */}
          <div className='mb-6'>
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

          {/* Classifications */}
          <div>
            <label className='mb-2 block text-sm font-medium'>Classifications</label>
            <p className='text-neutral mb-3 text-sm'>
              Select meta-categories this category belongs to. Used for filtering on grails.app.
            </p>
            <div className='flex flex-wrap gap-2'>
              {VALID_CLASSIFICATIONS.map((classification) => {
                const isSelected = classifications.includes(classification)
                return (
                  <label
                    key={classification}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all select-none ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type='checkbox'
                      checked={isSelected}
                      disabled={createMutation.isPending}
                      onChange={() => {
                        if (isSelected) {
                          setClassifications(classifications.filter((c) => c !== classification))
                        } else {
                          setClassifications([...classifications, classification])
                        }
                      }}
                      className='sr-only'
                    />
                    <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      isSelected ? 'border-primary bg-primary text-white' : 'border-neutral/30'
                    }`}>
                      {isSelected && (
                        <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                          <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                        </svg>
                      )}
                    </span>
                    {CLASSIFICATION_LABELS[classification]}
                  </label>
                )
              })}
            </div>
            {classifications.length > 0 && (
              <p className='text-neutral mt-2 text-xs'>
                Selected: {classifications.map((c) => CLASSIFICATION_LABELS[c]).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Images */}
        <div className='card mb-6'>
          <h2 className='mb-2 text-lg font-semibold'>Images</h2>
          <p className='text-neutral mb-6 text-sm'>
            Upload avatar and header images. JPEG or PNG, max 2 MB each. You can also add them later.
          </p>

          <div className='grid grid-cols-2 gap-6'>
            {/* Avatar */}
            <div>
              <label className='mb-2 block text-sm font-medium'>Avatar</label>
              {avatarPreview ? (
                <div className='relative'>
                  <img
                    src={avatarPreview}
                    alt='Avatar preview'
                    className='h-32 w-32 rounded-lg border border-border object-cover'
                  />
                  <button
                    type='button'
                    onClick={() => clearFile('avatar')}
                    className='absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-error text-white text-xs hover:bg-error/80'
                  >
                    <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className='flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-surface-2 transition-colors'>
                  <svg className='h-8 w-8 text-neutral mb-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M12 4v16m8-8H4' />
                  </svg>
                  <span className='text-neutral text-xs'>Upload</span>
                  <input
                    ref={avatarInputRef}
                    type='file'
                    accept='image/jpeg,image/png'
                    onChange={(e) => handleFileSelect('avatar', e.target.files?.[0] || null)}
                    className='sr-only'
                    disabled={createMutation.isPending}
                  />
                </label>
              )}
            </div>

            {/* Header */}
            <div>
              <label className='mb-2 block text-sm font-medium'>Header</label>
              {headerPreview ? (
                <div className='relative'>
                  <img
                    src={headerPreview}
                    alt='Header preview'
                    className='h-32 w-full rounded-lg border border-border object-cover'
                  />
                  <button
                    type='button'
                    onClick={() => clearFile('header')}
                    className='absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-error text-white text-xs hover:bg-error/80'
                  >
                    <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className='flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-surface-2 transition-colors'>
                  <svg className='h-8 w-8 text-neutral mb-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M12 4v16m8-8H4' />
                  </svg>
                  <span className='text-neutral text-xs'>Upload</span>
                  <input
                    ref={headerInputRef}
                    type='file'
                    accept='image/jpeg,image/png'
                    onChange={(e) => handleFileSelect('header', e.target.files?.[0] || null)}
                    className='sr-only'
                    disabled={createMutation.isPending}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Initial Names */}
        <div className='card mb-6'>
          <h2 className='mb-2 text-lg font-semibold'>Initial Names</h2>
          <p className='text-neutral mb-6 text-sm'>
            Optionally add ENS names to this category. You can also add them later.
          </p>

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
                      const names = content
                        .split(/[\n,]/)
                        .map(n => n.trim().replace(/^["']|["']$/g, ''))
                        .filter(n => n.length > 0 && !n.toLowerCase().includes('name'))
                      const newNames = names.join('\n')
                      setInitialNames(prev => prev ? `${prev}\n${newNames}` : newNames)
                    }
                  }
                  reader.readAsText(file)
                  e.target.value = ''
                }}
                className='text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary/80 file:cursor-pointer'
                disabled={createMutation.isPending}
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
              disabled={createMutation.isPending}
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

        {/* Actions */}
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
      </form>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmCreate}
        title="Create New Category"
        message={
          <div className="space-y-3">
            <p className="text-lg font-semibold text-warning">
              Are you sure you want to create this category?
            </p>
            <div className="bg-surface-2 rounded-lg p-3 space-y-1">
              <p><strong>Slug:</strong> <span className="font-mono">{slug}</span></p>
              {/* displayName && <p><strong>Display Name:</strong> {displayName}</p> */}
              {description && <p><strong>Description:</strong> {description}</p>}
              {classifications.length > 0 && (
                <p><strong>Classifications:</strong> {classifications.map((c) => CLASSIFICATION_LABELS[c]).join(', ')}</p>
              )}
              {avatarFile && <p><strong>Avatar:</strong> {avatarFile.name}</p>}
              {headerFile && <p><strong>Header:</strong> {headerFile.name}</p>}
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
