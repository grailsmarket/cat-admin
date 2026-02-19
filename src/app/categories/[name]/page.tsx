'use client'

import { useState, use, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { fetchCategory, updateCategory, addNames, removeNames, scanInvalidNames, uploadCategoryImage, deleteCategoryImage, type InvalidNameEntry } from '@/api/categories'
import { normalizeEnsName } from '@/lib/normalize'
import { ConfirmModal } from '@/components/ConfirmModal'
import ActivitySection from '@/components/ActivitySection'
import { VALID_CLASSIFICATIONS, CLASSIFICATION_LABELS, type Classification } from '@/constants/classifications'

type PageProps = {
  params: Promise<{ name: string }>
}

type NameSortField = 'ens_name' | 'added_at'
type SortDirection = 'asc' | 'desc'

export default function CategoryDetailPage({ params }: PageProps) {
  const { name } = use(params)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [description, setDescription] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editClassifications, setEditClassifications] = useState<Classification[]>([])
  const [newNames, setNewNames] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [nameSearch, setNameSearch] = useState('')
  const [nameSortField, setNameSortField] = useState<NameSortField>('ens_name')
  const [nameSortDirection, setNameSortDirection] = useState<SortDirection>('asc')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  
  // Invalid names scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState<{
    totalScanned: number
    invalidNames: InvalidNameEntry[]
  } | null>(null)
  const [showScanResults, setShowScanResults] = useState(false)

  // Image upload state
  const [imageUploading, setImageUploading] = useState<'avatar' | 'header' | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const headerInputRef = useRef<HTMLInputElement>(null)

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    type: 'add' | 'remove' | 'description' | 'delete-image'
    names: string[]
    imageType?: 'avatar' | 'header'
  }>({ isOpen: false, type: 'add', names: [] })

  const { data, isLoading, isFetching, error: fetchError } = useQuery({
    queryKey: ['category', name, page],
    queryFn: () => fetchCategory(name, page, 50),
    placeholderData: keepPreviousData, // Keep showing previous data while fetching new page
  })

  const category = data?.data

  // Update category mutation
  const updateMutation = useMutation({
    mutationFn: () => updateCategory(name, { description, display_name: editDisplayName, classifications: editClassifications }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category', name] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setIsEditing(false)
      showSuccess('Category updated successfully')
    },
    onError: (err: Error) => setError(err.message),
  })

  // Add names mutation
  const addNamesMutation = useMutation({
    mutationFn: (names: string[]) => addNames(name, names),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        setNewNames('')
        setShowAddForm(false)
        showSuccess(`Added ${result.added} name(s)${result.skipped ? `, skipped ${result.skipped} existing` : ''}`)
      } else {
        if (result.invalidNames && result.invalidNames.length > 0) {
          setError(`Invalid ENS names: ${result.invalidNames.slice(0, 5).join(', ')}${result.invalidNames.length > 5 ? ` and ${result.invalidNames.length - 5} more` : ''}`)
        } else {
          setError(result.error || 'Failed to add names')
        }
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  // Remove names mutation
  const removeNamesMutation = useMutation({
    mutationFn: (names: string[]) => removeNames(name, names),
    onSuccess: (result, removedNames) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        setSelectedNames(new Set())
        showSuccess(`Removed ${result.removed} name(s)`)
        
        // Update scan results to remove the deleted names
        if (scanResults) {
          const remainingInvalid = scanResults.invalidNames.filter(
            n => !removedNames.includes(n.name)
          )
          if (remainingInvalid.length === 0) {
            setShowScanResults(false)
            setScanResults(null)
          } else {
            setScanResults({
              ...scanResults,
              invalidNames: remainingInvalid,
            })
          }
        }
      } else {
        setError(result.error || 'Failed to remove names')
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const handleImageUpload = async (type: 'avatar' | 'header', file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError(`Only JPEG and PNG files are allowed.`)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(`File must be 2 MB or less.`)
      return
    }

    setImageUploading(type)
    setError('')
    try {
      const result = await uploadCategoryImage(name, type, file)
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        showSuccess(`${type === 'avatar' ? 'Avatar' : 'Header'} image uploaded successfully`)
      } else {
        setError(result.error || `Failed to upload ${type} image`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to upload ${type} image`)
    } finally {
      setImageUploading(null)
    }
  }

  const handleImageDelete = async (type: 'avatar' | 'header') => {
    setError('')
    try {
      const result = await deleteCategoryImage(name, type)
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['category', name] })
        showSuccess(`${type === 'avatar' ? 'Avatar' : 'Header'} image deleted`)
      } else {
        setError(result.error || `Failed to delete ${type} image`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${type} image`)
    }
    setConfirmModal({ isOpen: false, type: 'add', names: [] })
  }

  const handleScanInvalidNames = async () => {
    setIsScanning(true)
    setError('')
    try {
      const result = await scanInvalidNames(name)
      setScanResults({
        totalScanned: result.totalScanned,
        invalidNames: result.invalidNames,
      })
      setShowScanResults(true)
      if (result.invalidCount === 0) {
        showSuccess(`Scanned ${result.totalScanned.toLocaleString()} names - no invalid names found!`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan for invalid names')
    } finally {
      setIsScanning(false)
    }
  }

  const handleRemoveInvalidNames = (names: string[]) => {
    setConfirmModal({ isOpen: true, type: 'remove', names })
  }

  const handleExportInvalidNames = () => {
    if (!scanResults || scanResults.invalidNames.length === 0) return
    
    // Create CSV content
    const headers = ['name', 'reason', 'added_at']
    const rows = scanResults.invalidNames.map(entry => [
      entry.name,
      entry.reason,
      new Date(entry.added_at).toISOString(),
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    // Download as file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `invalid-names-${name}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleStartEdit = () => {
    setDescription(category?.description || '')
    setEditDisplayName(category?.display_name || '')
    const currentClassifications = (category?.classifications || []).filter(
      (c): c is Classification => VALID_CLASSIFICATIONS.includes(c as Classification)
    )
    setEditClassifications(currentClassifications)
    setIsEditing(true)
    setError('')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setDescription('')
    setEditDisplayName('')
    setEditClassifications([])
  }

  const handleSaveDescription = () => {
    setConfirmModal({ isOpen: true, type: 'description', names: [] })
  }

  const handleAddNames = () => {
    setError('')

    if (parsedNames.length === 0) {
      setError('Please enter at least one ENS name')
      return
    }

    if (hasInvalidInputNames) {
      setError('Please fix invalid names before adding')
      return
    }

    // Use normalized names
    const validNames = parsedNames
      .filter(n => n.isValid && n.normalized)
      .map(n => n.normalized as string)

    // Show confirmation modal
    setConfirmModal({ isOpen: true, type: 'add', names: validNames })
  }

  const handleRemoveSelected = () => {
    if (selectedNames.size === 0) return
    setError('')
    // Show confirmation modal
    setConfirmModal({ isOpen: true, type: 'remove', names: Array.from(selectedNames) })
  }

  const handleConfirmAction = () => {
    if (confirmModal.type === 'add') {
      addNamesMutation.mutate(confirmModal.names, {
        onSettled: () => setConfirmModal({ isOpen: false, type: 'add', names: [] }),
      })
    } else if (confirmModal.type === 'remove') {
      removeNamesMutation.mutate(confirmModal.names, {
        onSettled: () => setConfirmModal({ isOpen: false, type: 'remove', names: [] }),
      })
    } else if (confirmModal.type === 'description') {
      updateMutation.mutate(undefined, {
        onSettled: () => setConfirmModal({ isOpen: false, type: 'description', names: [] }),
      })
    } else if (confirmModal.type === 'delete-image' && confirmModal.imageType) {
      handleImageDelete(confirmModal.imageType)
    }
  }

  const toggleName = (ensName: string) => {
    const newSelected = new Set(selectedNames)
    if (newSelected.has(ensName)) {
      newSelected.delete(ensName)
    } else {
      newSelected.add(ensName)
    }
    setSelectedNames(newSelected)
  }

  const toggleAllNames = () => {
    if (!category?.names) return
    if (selectedNames.size === category.names.length) {
      setSelectedNames(new Set())
    } else {
      setSelectedNames(new Set(category.names.map((m) => m.ens_name)))
    }
  }

  const filteredNames = (() => {
    const filtered = category?.names?.filter((m) =>
      m.ens_name.toLowerCase().includes(nameSearch.toLowerCase())
    )
    if (!filtered) return filtered
    
    // Sort
    return [...filtered].sort((a, b) => {
      let comparison = 0
      switch (nameSortField) {
        case 'ens_name':
          comparison = a.ens_name.localeCompare(b.ens_name)
          break
        case 'added_at':
          comparison = new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
          break
      }
      return nameSortDirection === 'asc' ? comparison : -comparison
    })
  })()

  const handleNameSort = (field: NameSortField) => {
    if (nameSortField === field) {
      setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setNameSortField(field)
      setNameSortDirection('asc')
    }
  }

  const NameSortIcon = ({ field }: { field: NameSortField }) => {
    if (nameSortField !== field) return null
    return (
      <span className='ml-1'>
        {nameSortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffMonth = Math.floor(diffDay / 30)
    const diffYear = Math.floor(diffDay / 365)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
    if (diffMonth < 12) return `${diffMonth}mo ago`
    return `${diffYear}y ago`
  }

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Parse and validate ENS names with live feedback
  const parsedNames = useMemo(() => {
    const lines = newNames.split('\n').map((n) => n.trim()).filter((n) => n.length > 0)
    return lines.map(inputName => {
      // Check for invalid TLDs (only .eth or no TLD allowed)
      const dotIndex = inputName.lastIndexOf('.')
      if (dotIndex !== -1) {
        const tld = inputName.slice(dotIndex)
        if (tld !== '.eth') {
          return {
            original: inputName,
            normalized: null,
            isValid: false,
            reason: `invalid TLD "${tld}" - only .eth is allowed`
          }
        }
      }
      
      // Add .eth if missing
      const fullName = inputName.endsWith('.eth') ? inputName : `${inputName}.eth`
      const normalized = normalizeEnsName(fullName)
      // Strict: name must equal its normalized form (no uppercase, etc.)
      const isValid = normalized !== null && normalized === fullName
      return {
        original: inputName,
        normalized,
        isValid,
        reason: normalized === null 
          ? 'invalid ENS name' 
          : normalized !== fullName 
            ? `must be lowercase: ${normalized.replace('.eth', '')}` 
            : null
      }
    })
  }, [newNames])

  const inputNameCount = parsedNames.length
  const invalidInputNames = parsedNames.filter(n => !n.isValid)
  const hasInvalidInputNames = invalidInputNames.length > 0

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
        <div className='lg:col-span-1 space-y-6'>
          {/* Category header + Details */}
          <div className='card'>
            {/* Header */}
            <h1 className='text-2xl font-bold'>{category.display_name || category.name}</h1>
            {category.display_name && (
              <p className='text-neutral text-sm font-mono'>{category.name}</p>
            )}

            {/* Divider */}
            <div className='border-border my-4 border-t' />

            {/* Description, Display Name & Classifications */}
            {isEditing ? (
              <div className='space-y-4'>
                <div>
                  <label className='mb-2 block text-sm font-medium'>Display Name</label>
                  <input
                    type='text'
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className='w-full'
                    placeholder='Human-readable name...'
                  />
                </div>
                <div>
                  <label className='mb-2 block text-sm font-medium'>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className='w-full resize-none'
                    placeholder='Enter description...'
                  />
                </div>
                
                <div>
                  <label className='mb-2 block text-sm font-medium'>Classifications</label>
                  <div className='flex flex-wrap gap-2'>
                    {VALID_CLASSIFICATIONS.map((classification) => {
                      const isSelected = editClassifications.includes(classification)
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
                            onChange={() => {
                              if (isSelected) {
                                setEditClassifications(editClassifications.filter((c) => c !== classification))
                              } else {
                                setEditClassifications([...editClassifications, classification])
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
                </div>
                
                <div className='flex gap-2 pt-2'>
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
              <div className='space-y-4'>
                <div>
                  <div className='flex items-center justify-between'>
                    <p className='text-neutral text-sm'>Display Name</p>
                    <button onClick={handleStartEdit} className='text-primary hover:underline text-sm'>
                      Edit
                    </button>
                  </div>
                  <p className='mt-1'>{category.display_name || <span className='text-neutral italic'>Same as slug</span>}</p>
                </div>
                <div>
                  <p className='text-neutral text-sm'>Description</p>
                  <p className='mt-1'>{category.description || <span className='text-neutral italic'>No description</span>}</p>
                </div>
                
                <div>
                  <p className='text-neutral text-sm mb-2'>Classifications</p>
                  {category.classifications && category.classifications.length > 0 ? (
                    <div className='flex flex-wrap gap-1.5'>
                      {category.classifications.map((classification) => (
                        <span
                          key={classification}
                          className='bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium'
                        >
                          {CLASSIFICATION_LABELS[classification as Classification] || classification}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className='text-neutral italic text-sm'>No classifications</p>
                  )}
                </div>
              </div>
            )}

            <div className='border-border mt-6 border-t pt-6'>
              <div className='grid grid-cols-3 gap-4 text-sm'>
                <div>
                  <p className='text-neutral'>Names</p>
                  <p className='text-xl font-bold'>{(category.name_count ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className='text-neutral'>Created</p>
                  <p className='group relative cursor-default'>
                    {formatRelativeTime(category.created_at)}
                    <span className='bg-secondary border-border absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block'>
                      {formatFullDate(category.created_at)}
                    </span>
                  </p>
                </div>
                <div>
                  <p className='text-neutral'>Last Updated</p>
                  <p className='group relative cursor-default'>
                    {formatRelativeTime(category.updated_at)}
                    <span className='bg-secondary border-border absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded border px-2 py-1 text-xs group-hover:block'>
                      {formatFullDate(category.updated_at)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Images Section */}
          <div className='card'>
            <h2 className='mb-4 text-lg font-semibold'>Images</h2>
            <div className='space-y-4'>
              {/* Avatar */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-neutral text-sm'>Avatar</p>
                  <div className='flex items-center gap-2'>
                    <label className='text-primary hover:underline text-sm cursor-pointer'>
                      {category.avatar_url ? 'Replace' : 'Upload'}
                      <input
                        ref={avatarInputRef}
                        type='file'
                        accept='image/jpeg,image/png'
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload('avatar', file)
                          if (avatarInputRef.current) avatarInputRef.current.value = ''
                        }}
                        className='sr-only'
                        disabled={imageUploading !== null}
                      />
                    </label>
                    {category.avatar_url && (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, type: 'delete-image', names: [], imageType: 'avatar' })}
                        className='text-error hover:underline text-sm'
                        disabled={imageUploading !== null}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {imageUploading === 'avatar' ? (
                  <div className='flex h-24 w-24 items-center justify-center rounded-lg border border-border'>
                    <div className='h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent' />
                  </div>
                ) : category.avatar_url ? (
                  <img
                    src={category.avatar_url}
                    alt={`${category.name} avatar`}
                    className='h-24 w-24 rounded-lg border border-border object-cover'
                  />
                ) : (
                  <div className='flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border'>
                    <span className='text-neutral text-xs'>No avatar</span>
                  </div>
                )}
              </div>

              {/* Header */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-neutral text-sm'>Header</p>
                  <div className='flex items-center gap-2'>
                    <label className='text-primary hover:underline text-sm cursor-pointer'>
                      {category.header_url ? 'Replace' : 'Upload'}
                      <input
                        ref={headerInputRef}
                        type='file'
                        accept='image/jpeg,image/png'
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload('header', file)
                          if (headerInputRef.current) headerInputRef.current.value = ''
                        }}
                        className='sr-only'
                        disabled={imageUploading !== null}
                      />
                    </label>
                    {category.header_url && (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, type: 'delete-image', names: [], imageType: 'header' })}
                        className='text-error hover:underline text-sm'
                        disabled={imageUploading !== null}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {imageUploading === 'header' ? (
                  <div className='flex h-32 w-full items-center justify-center rounded-lg border border-border'>
                    <div className='h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent' />
                  </div>
                ) : category.header_url ? (
                  <img
                    src={category.header_url}
                    alt={`${category.name} header`}
                    className='h-32 w-full rounded-lg border border-border object-cover'
                  />
                ) : (
                  <div className='flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-border'>
                    <span className='text-neutral text-xs'>No header</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activity Section */}
          <div className='card'>
            <h2 className='mb-4 text-lg font-semibold'>Recent Activity</h2>
            <ActivitySection category={name} limit={10} />
          </div>
        </div>

        {/* Right column - Names */}
        <div className='lg:col-span-2'>
          <div className='card'>
            {/* Names header */}
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
              <h2 className='text-lg font-semibold'>Names</h2>
              <div className='flex items-center gap-2'>
                {selectedNames.size > 0 && (
                  <button
                    onClick={handleRemoveSelected}
                    className='btn btn-danger text-sm'
                    disabled={removeNamesMutation.isPending}
                  >
                    {removeNamesMutation.isPending ? 'Removing...' : `Remove ${selectedNames.size} Selected`}
                  </button>
                )}
                <button
                  onClick={handleScanInvalidNames}
                  className='btn btn-secondary text-sm'
                  disabled={isScanning}
                  title='Scan for invalid ENS names in this category'
                >
                  {isScanning ? (
                    <>
                      <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2' />
                      Scanning...
                    </>
                  ) : (
                    'Scan Invalid'
                  )}
                </button>
                <button onClick={() => setShowAddForm(!showAddForm)} className='btn btn-primary text-sm'>
                  {showAddForm ? 'Cancel' : 'Add Names'}
                </button>
              </div>
            </div>

            {/* Invalid names scan results */}
            {showScanResults && scanResults && scanResults.invalidNames.length > 0 && (
              <div className='bg-warning/10 border-warning mb-6 rounded-lg border p-4'>
                <div className='flex items-start justify-between mb-4'>
                  <div className='flex items-start gap-3'>
                    <svg className='h-5 w-5 text-warning flex-shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
                    </svg>
                    <div>
                      <p className='font-medium text-warning'>
                        Found {scanResults.invalidNames.length} Invalid Name{scanResults.invalidNames.length !== 1 ? 's' : ''}
                      </p>
                      <p className='text-neutral text-sm mt-1'>
                        Scanned {scanResults.totalScanned.toLocaleString()} names in this category
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowScanResults(false)}
                    className='text-neutral hover:text-foreground'
                  >
                    <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  </button>
                </div>
                
                <div className='border-border max-h-48 overflow-y-auto rounded-lg border bg-background'>
                  <table className='min-w-full text-sm'>
                    <thead className='bg-secondary sticky top-0'>
                      <tr>
                        <th className='text-left'>Name</th>
                        <th className='text-left'>Reason</th>
                        <th className='text-right'>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResults.invalidNames.map((entry) => (
                        <tr key={entry.name} className='border-border border-t'>
                          <td className='font-mono text-primary'>{entry.name}</td>
                          <td className='text-neutral'>{entry.reason}</td>
                          <td className='text-right'>
                            <button
                              onClick={() => handleRemoveInvalidNames([entry.name])}
                              className='text-error hover:underline text-xs'
                              disabled={removeNamesMutation.isPending}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className='mt-4 flex justify-end gap-2'>
                  <button
                    onClick={handleExportInvalidNames}
                    className='btn btn-secondary text-sm'
                  >
                    Export CSV
                  </button>
                  {scanResults.invalidNames.length > 1 && (
                    <button
                      onClick={() => handleRemoveInvalidNames(scanResults.invalidNames.map(n => n.name))}
                      className='btn btn-danger text-sm'
                      disabled={removeNamesMutation.isPending}
                    >
                      {removeNamesMutation.isPending ? 'Removing...' : `Remove All ${scanResults.invalidNames.length} Invalid Names`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Add names form */}
            {showAddForm && (
              <div className='bg-secondary mb-6 rounded-lg p-4'>
                <label className='mb-2 block text-sm font-medium'>
                  Add ENS Names {inputNameCount > 0 && (
                    <span className={hasInvalidInputNames ? 'text-error' : 'text-neutral'}>
                      ({inputNameCount} names{hasInvalidInputNames ? `, ${invalidInputNames.length} invalid` : ''})
                    </span>
                  )}
                </label>
                <textarea
                  value={newNames}
                  onChange={(e) => setNewNames(e.target.value)}
                  placeholder={'vitalik.eth\nnick.eth\nbrantly.eth'}
                  rows={6}
                  className={`mb-4 w-full font-mono text-sm ${hasInvalidInputNames ? 'border-error' : ''}`}
                />
                {hasInvalidInputNames && (
                  <div className='mb-4 rounded-lg border border-error bg-error/10 p-3'>
                    <p className='text-error text-sm font-medium mb-1'>Invalid ENS names:</p>
                    <ul className='text-error text-sm list-disc list-inside'>
                      {invalidInputNames.slice(0, 10).map((n, i) => (
                        <li key={i}>
                          <span className='font-mono'>{n.original}</span>
                          {n.reason && <span className='text-neutral ml-2'>({n.reason})</span>}
                        </li>
                      ))}
                      {invalidInputNames.length > 10 && (
                        <li className='text-neutral'>...and {invalidInputNames.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className='flex items-center justify-between'>
                  <p className='text-neutral text-sm'>Enter one ENS name per line</p>
                  <button
                    onClick={handleAddNames}
                    className='btn btn-primary text-sm'
                    disabled={addNamesMutation.isPending || inputNameCount === 0 || hasInvalidInputNames}
                  >
                    {addNamesMutation.isPending ? 'Adding...' : 'Add Names'}
                  </button>
                </div>
              </div>
            )}

            {/* Names search */}
            {category.names && category.names.length > 0 && (
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
                  placeholder='Search names...'
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  className='w-full pl-10 text-sm'
                />
              </div>
            )}

            {/* Names list */}
            {(!category.names || category.names.length === 0) && (
              <div className='py-8 text-center'>
                <p className='text-neutral'>No names in this category yet.</p>
                {!showAddForm && (
                  <button onClick={() => setShowAddForm(true)} className='text-primary hover:underline mt-2 text-sm'>
                    Add your first names
                  </button>
                )}
              </div>
            )}

            {filteredNames && filteredNames.length > 0 && (
              <>
                <div className='relative'>
                  {/* Loading overlay */}
                  {isFetching && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center rounded-lg' style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
                      <div className='border-primary h-10 w-10 animate-spin rounded-full border-4 border-t-transparent' />
                    </div>
                  )}
                  <div className='border-border max-h-[70vh] overflow-y-auto rounded-lg border'>
                  <table className='min-w-full'>
                    <thead className='bg-secondary sticky top-0'>
                      <tr>
                        <th className='w-10'>
                          <input
                            type='checkbox'
                            checked={selectedNames.size === category.names?.length && category.names.length > 0}
                            onChange={toggleAllNames}
                            className='rounded'
                          />
                        </th>
                        <th 
                          className='cursor-pointer hover:text-foreground'
                          onClick={() => handleNameSort('ens_name')}
                        >
                          ENS Name <NameSortIcon field='ens_name' />
                        </th>
                        <th 
                          className='cursor-pointer hover:text-foreground'
                          onClick={() => handleNameSort('added_at')}
                        >
                          Added <NameSortIcon field='added_at' />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNames.map((entry) => (
                        <tr key={entry.ens_name} className={selectedNames.has(entry.ens_name) ? 'bg-primary/5' : ''}>
                          <td>
                            <input
                              type='checkbox'
                              checked={selectedNames.has(entry.ens_name)}
                              onChange={() => toggleName(entry.ens_name)}
                              className='rounded'
                            />
                          </td>
                          <td className='font-mono'>
                            <Link href={`/names/${entry.ens_name}`} className='text-primary hover:underline'>
                              {entry.ens_name}
                            </Link>
                          </td>
                          <td className='text-neutral text-sm'>{formatDate(entry.added_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>

                {/* Pagination */}
                {category.pagination && category.pagination.totalPages > 1 && (
                  <div className='mt-4 flex items-center justify-between'>
                    <p className='text-neutral text-sm'>
                      Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, category.pagination.totalNames)} of{' '}
                      {category.pagination.totalNames.toLocaleString()}
                    </p>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || isFetching}
                        className='btn btn-secondary text-sm disabled:opacity-50'
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(category.pagination.totalPages, p + 1))}
                        disabled={page === category.pagination.totalPages || isFetching}
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
            {category.names && category.names.length > 0 && filteredNames?.length === 0 && (
              <div className='py-8 text-center'>
                <p className='text-neutral'>No names match your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: 'add', names: [] })}
        onConfirm={handleConfirmAction}
        title={
          confirmModal.type === 'add'
            ? 'Add Names to Category'
            : confirmModal.type === 'remove'
              ? 'Remove Names from Category'
              : confirmModal.type === 'delete-image'
                ? `Delete ${confirmModal.imageType === 'avatar' ? 'Avatar' : 'Header'} Image`
                : 'Update Category'
        }
        message={
          confirmModal.type === 'add'
            ? `Are you sure you want to add ${confirmModal.names.length} name${confirmModal.names.length !== 1 ? 's' : ''} to "${name}"?`
            : confirmModal.type === 'remove'
              ? `Are you sure you want to remove ${confirmModal.names.length} name${confirmModal.names.length !== 1 ? 's' : ''} from "${name}"? This action cannot be undone.`
              : confirmModal.type === 'delete-image'
                ? `Are you sure you want to delete the ${confirmModal.imageType} image for "${name}"? This will remove it from S3.`
                : `Are you sure you want to update "${name}"?`
        }
        confirmText={
          confirmModal.type === 'add'
            ? 'Add Names'
            : confirmModal.type === 'remove'
              ? 'Remove Names'
              : confirmModal.type === 'delete-image'
                ? 'Delete Image'
                : 'Update'
        }
        variant={confirmModal.type === 'remove' || confirmModal.type === 'delete-image' ? 'danger' : 'default'}
        isLoading={addNamesMutation.isPending || removeNamesMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}

