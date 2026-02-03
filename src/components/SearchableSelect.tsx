'use client'

import { useState, useRef, useEffect } from 'react'

export interface SearchableOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearch('')
    } else if (e.key === 'Enter' && filteredOptions.length === 1) {
      onChange(filteredOptions[0].value)
      setIsOpen(false)
      setSearch('')
    }
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearch('')
  }

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true)
    }
  }

  // Display value: show search when open, otherwise show selected or placeholder
  const displayValue = isOpen ? search : (selectedOption?.label || '')

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Combined search input / display field */}
      <div className='relative'>
        <input
          ref={inputRef}
          type='text'
          value={displayValue}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pr-10 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        />
        <svg
          className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral pointer-events-none transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
        >
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
        </svg>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div 
          className='absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden'
          style={{ 
            backgroundColor: 'var(--secondary)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Options list */}
          <div className='max-h-[70vh] overflow-y-auto'>
            {filteredOptions.length === 0 ? (
              <div 
                className='px-4 py-3 text-center text-neutral text-sm'
                style={{ backgroundColor: 'var(--secondary)' }}
              >
                No matching categories
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className='cursor-pointer px-4 py-2'
                  style={{ 
                    backgroundColor: option.value === value ? 'var(--tertiary)' : 'var(--secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = option.value === value ? 'var(--tertiary)' : 'var(--secondary)'
                  }}
                >
                  <div className='font-medium'>{option.label}</div>
                  {option.sublabel && (
                    <div className='text-neutral text-xs'>{option.sublabel}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

