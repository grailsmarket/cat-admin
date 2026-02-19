'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchCategories } from '@/api/categories'
import { CLASSIFICATION_LABELS, type Classification } from '@/constants/classifications'

type SortField = 'name' | 'name_count' | 'created_at' | 'updated_at'
type SortDirection = 'asc' | 'desc'

export default function CategoriesPage() {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const categories = useMemo(() => data?.data || [], [data?.data])

  // Filter and sort categories
  const filteredCategories = useMemo(() => {
    // Filter by search (includes classifications)
    const searchLower = search.toLowerCase()
    const filtered = search
      ? categories.filter(
          (cat) =>
            cat.name.toLowerCase().includes(searchLower) ||
            cat.description?.toLowerCase().includes(searchLower) ||
            cat.classifications?.some(c => c.toLowerCase().includes(searchLower))
        )
      : [...categories]

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'name_count':
          comparison = (a.name_count ?? 0) - (b.name_count ?? 0)
          break
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [categories, search, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return (
      <span className='ml-1'>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className='p-4 lg:p-8'>
      {/* Header */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>Name Categories</h1>
      </div>

      {/* Search and filters */}
      <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-center'>
        <div className='relative flex-1 max-w-md'>
          <svg
            className='text-neutral absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2'
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
            placeholder='Search categories...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full pl-10'
          />
        </div>
        <div className='flex items-center gap-2 sm:ml-auto'>
          <button onClick={() => refetch()} className='btn btn-secondary'>
            <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            Refresh
          </button>
          <Link href='/categories/new' className='btn btn-primary'>
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
            </svg>
            New Category
          </Link>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className='bg-error/10 border-error mb-6 rounded-lg border p-4'>
          <p className='text-error'>Failed to load categories. Please try again.</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className='flex items-center justify-center py-12'>
          <div className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && categories.length === 0 && (
        <div className='card text-center py-12'>
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
          <h3 className='mb-2 text-lg font-semibold'>No categories yet</h3>
          <p className='text-neutral mb-4'>Create your first category to get started.</p>
          <Link href='/categories/new' className='btn btn-primary'>
            Create Category
          </Link>
        </div>
      )}

      {/* Categories table */}
      {!isLoading && !error && filteredCategories.length > 0 && (
        <div className='card overflow-hidden p-0'>
          <div className='overflow-x-auto'>
          <table>
            <thead>
              <tr>
                <th className='w-16'>Images</th>
                <th
                  className='cursor-pointer hover:text-foreground'
                  onClick={() => handleSort('name')}
                >
                  Slug <SortIcon field='name' />
                </th>
                <th>Display Name</th>
                <th className='hidden md:table-cell'>Classifications</th>
                <th
                  className='cursor-pointer hover:text-foreground'
                  onClick={() => handleSort('name_count')}
                >
                  Names <SortIcon field='name_count' />
                </th>
                <th
                  className='hidden lg:table-cell cursor-pointer hover:text-foreground'
                  onClick={() => handleSort('created_at')}
                >
                  Created <SortIcon field='created_at' />
                </th>
                <th
                  className='hidden lg:table-cell cursor-pointer hover:text-foreground'
                  onClick={() => handleSort('updated_at')}
                >
                  Updated <SortIcon field='updated_at' />
                </th>
                <th className='w-20'></th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((category) => {
                const hasAvatar = !!category.avatar_image_key
                const hasHeader = !!category.header_image_key
                const imageStatus = hasAvatar && hasHeader ? 'complete' : hasAvatar || hasHeader ? 'partial' : 'none'
                return (
                <tr key={category.name}>
                  <td className='w-16'>
                    {imageStatus === 'complete' ? (
                      <span className='inline-block h-2.5 w-2.5 rounded-full bg-success' title='Avatar and header uploaded' />
                    ) : imageStatus === 'partial' ? (
                      <span className='inline-block h-2.5 w-2.5 rounded-full bg-warning' title={`Missing ${!hasAvatar ? 'avatar' : 'header'}`} />
                    ) : (
                      <span className='inline-block h-2.5 w-2.5 rounded-full bg-neutral/30' title='No images' />
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/categories/${category.name}`}
                      className='text-primary hover:underline font-medium'
                    >
                      {category.name}
                    </Link>
                  </td>
                  <td className='text-neutral max-w-xs truncate'>{category.display_name || '—'}</td>
                  <td className='hidden md:table-cell'>
                    {category.classifications && category.classifications.length > 0 ? (
                      <div className='flex flex-wrap gap-1'>
                        {category.classifications.map((c) => (
                          <span
                            key={c}
                            className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'
                          >
                            {CLASSIFICATION_LABELS[c as Classification] || c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className='text-neutral'>—</span>
                    )}
                  </td>
                  <td>
                    <span className='bg-tertiary rounded-full px-3 py-1 text-sm'>
                      {(category.name_count ?? 0).toLocaleString()}
                    </span>
                  </td>
                  <td className='hidden lg:table-cell text-neutral text-sm'>{formatDate(category.created_at)}</td>
                  <td className='hidden lg:table-cell text-neutral text-sm'>{formatDate(category.updated_at)}</td>
                  <td>
                    <Link
                      href={`/categories/${category.name}`}
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
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* No results */}
      {!isLoading && !error && categories.length > 0 && filteredCategories.length === 0 && (
        <div className='card text-center py-8'>
          <p className='text-neutral'>No categories match your search.</p>
        </div>
      )}
    </div>
  )
}
