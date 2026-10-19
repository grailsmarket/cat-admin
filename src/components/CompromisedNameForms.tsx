'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { normalizeEnsName } from '@/lib/normalize'
import {
  ADDRESS_RE,
  TX_HASH_RE,
  MAX_ALLOWED_ADDRESSES,
  MAX_NOTES_LENGTH,
  createCompromisedName,
  getErrorMessage,
  listCompromisedNames,
  parseAddressList,
  updateCompromisedName,
  type CompromiseIncident,
  type CompromisedName,
} from '@/api/compromised-names'

function FormModal({
  title,
  onClose,
  isLoading,
  children,
}: {
  title: string
  onClose: () => void
  isLoading: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isLoading, onClose])

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm'
        onClick={isLoading ? undefined : onClose}
      />
      <div
        className='card relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto shadow-xl'
        role='dialog'
        aria-modal='true'
      >
        <h2 className='mb-4 text-lg font-semibold'>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className='text-neutral mb-1 block text-xs'>{label}</label>
      {children}
      {hint && <p className='text-neutral mt-1 text-xs'>{hint}</p>}
    </div>
  )
}

// Validates the shared address fields; returns an error message or null
function validateAddresses(originalOwner: string, allowedText: string) {
  if (!ADDRESS_RE.test(originalOwner.trim())) {
    return { error: 'Original owner must be a 0x address', allowed: [] }
  }
  const { valid, invalid } = parseAddressList(allowedText)
  if (invalid.length > 0) {
    return { error: `Invalid recovery wallet(s): ${invalid.join(', ')}`, allowed: [] }
  }
  if (valid.length > MAX_ALLOWED_ADDRESSES) {
    return { error: `At most ${MAX_ALLOWED_ADDRESSES} recovery wallets`, allowed: [] }
  }
  return { error: null, allowed: valid }
}

export function FlagNameModal({
  incidents,
  onClose,
  onSaved,
}: {
  incidents: CompromiseIncident[]
  onClose: () => void
  onSaved: () => void
}) {
  const [incident, setIncident] = useState(incidents[0]?.slug ?? '')
  const [name, setName] = useState('')
  const [originalOwner, setOriginalOwner] = useState('')
  const [allowedText, setAllowedText] = useState('')
  const [takenBy, setTakenBy] = useState('')
  const [takenTxHash, setTakenTxHash] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Existing flag for this name: POST upserts, so the admin must confirm the overwrite
  const [existing, setExisting] = useState<CompromisedName | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  // Any edit invalidates a previous overwrite confirmation
  useEffect(() => {
    setExisting(null)
  }, [name])

  const createMutation = useMutation({
    mutationFn: createCompromisedName,
    onSuccess: (result) => {
      if (!result.success) {
        setFormError(getErrorMessage(result.error, 'Failed to flag name'))
        return
      }
      toast.success(`Flagged ${result.data?.name ?? 'name'} as compromised`)
      onSaved()
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const submit = async () => {
    setFormError(null)

    if (!incident) return setFormError('Select an incident')
    const normalized = normalizeEnsName(name)
    if (!normalized) return setFormError('Name is not a valid ENS name')

    const { error, allowed } = validateAddresses(originalOwner, allowedText)
    if (error) return setFormError(error)
    if (takenBy.trim() && !ADDRESS_RE.test(takenBy.trim())) return setFormError('Taken by must be a 0x address')
    if (takenTxHash.trim() && !TX_HASH_RE.test(takenTxHash.trim())) {
      return setFormError('Tx hash must be 0x followed by 64 hex characters')
    }
    if (notes.length > MAX_NOTES_LENGTH) return setFormError(`Notes must be under ${MAX_NOTES_LENGTH} characters`)

    if (!existing) {
      setIsChecking(true)
      try {
        const lookup = await listCompromisedNames({ q: normalized, limit: 200 })
        const match = lookup.data?.names.find((n) => n.name === normalized)
        if (match) {
          setExisting(match)
          return
        }
      } catch {
        return setFormError('Could not check for an existing flag, please retry')
      } finally {
        setIsChecking(false)
      }
    }

    createMutation.mutate({
      incident,
      name: normalized,
      originalOwner: originalOwner.trim().toLowerCase(),
      allowedAddresses: allowed,
      takenBy: takenBy.trim().toLowerCase() || undefined,
      takenTxHash: takenTxHash.trim() || undefined,
      takenAt: takenAt ? new Date(takenAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
    })
  }

  const isBusy = isChecking || createMutation.isPending
  const normalizedPreview = name.trim() ? normalizeEnsName(name) : null

  return (
    <FormModal title='Flag a compromised name' onClose={onClose} isLoading={isBusy}>
      <div className='space-y-3'>
        {incidents.length === 0 ? (
          <p className='text-warning text-sm'>
            No incidents exist yet. Incidents are created by the backend import script.
          </p>
        ) : (
          <Field label='Incident'>
            <select value={incident} onChange={(e) => setIncident(e.target.value)} className='w-full'>
              {incidents.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label='Name'
          hint={
            name.trim()
              ? normalizedPreview
                ? normalizedPreview !== name.trim()
                  ? `Will be saved as ${normalizedPreview}`
                  : undefined
                : 'Not a valid ENS name'
              : undefined
          }
        >
          <input
            type='text'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='vitalik.eth'
            className='w-full'
          />
        </Field>
        <Field label='Original owner (stolen from)'>
          <input
            type='text'
            value={originalOwner}
            onChange={(e) => setOriginalOwner(e.target.value)}
            placeholder='0x…'
            className='w-full font-mono text-sm'
          />
        </Field>
        <Field
          label='Recovery wallets (optional)'
          hint={`Extra wallets allowed to buy the name back. One per line, max ${MAX_ALLOWED_ADDRESSES}.`}
        >
          <textarea
            value={allowedText}
            onChange={(e) => setAllowedText(e.target.value)}
            rows={3}
            className='w-full font-mono text-sm'
          />
        </Field>
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <Field label='Taken by (optional)'>
            <input
              type='text'
              value={takenBy}
              onChange={(e) => setTakenBy(e.target.value)}
              placeholder='0x…'
              className='w-full font-mono text-sm'
            />
          </Field>
          <Field label='Taken at (optional, your local time)'>
            <input
              type='datetime-local'
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              className='w-full'
            />
          </Field>
        </div>
        <Field label='Taken tx hash (optional)'>
          <input
            type='text'
            value={takenTxHash}
            onChange={(e) => setTakenTxHash(e.target.value)}
            placeholder='0x…'
            className='w-full font-mono text-sm'
          />
        </Field>
        <Field label='Notes (optional)'>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className='w-full' />
        </Field>

        {existing && (
          <div className='bg-warning/10 border-warning rounded-lg border p-3 text-sm'>
            <p className='text-warning font-medium'>{existing.name} is already flagged</p>
            <p className='text-neutral mt-1'>
              Status: {existing.status}
              {existing.resolved_reason ? ` (${existing.resolved_reason})` : ''}, incident {existing.incident_slug}.
              Submitting again will overwrite its incident, original owner and recovery wallets
              {existing.status === 'resolved' ? ', and re-activate it' : ''}. To change only some fields, close
              this and use Edit on the existing row instead.
            </p>
          </div>
        )}

        {formError && <p className='text-error text-sm'>{formError}</p>}

        <div className='flex gap-3 pt-2'>
          <button onClick={onClose} disabled={isBusy} className='btn btn-secondary flex-1'>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={isBusy || incidents.length === 0}
            className={`btn flex-1 ${existing ? 'bg-amber-600 text-white hover:bg-amber-700' : 'btn-primary'}`}
          >
            {isBusy ? 'Saving…' : existing ? 'Overwrite flag' : 'Flag name'}
          </button>
        </div>
      </div>
    </FormModal>
  )
}

export function EditCompromisedModal({
  item,
  onClose,
  onSaved,
}: {
  item: CompromisedName
  onClose: () => void
  onSaved: () => void
}) {
  const [originalOwner, setOriginalOwner] = useState(item.original_owner)
  const [allowedText, setAllowedText] = useState(item.allowed_addresses.join('\n'))
  const [notes, setNotes] = useState(item.notes ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateCompromisedName>[1]) => updateCompromisedName(item.id, input),
    onSuccess: (result) => {
      if (!result.success) {
        setFormError(getErrorMessage(result.error, 'Failed to update'))
        return
      }
      toast.success(`Updated ${item.name}`)
      onSaved()
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const submit = () => {
    setFormError(null)
    const { error, allowed } = validateAddresses(originalOwner, allowedText)
    if (error) return setFormError(error)
    if (notes.length > MAX_NOTES_LENGTH) return setFormError(`Notes must be under ${MAX_NOTES_LENGTH} characters`)

    updateMutation.mutate({
      originalOwner: originalOwner.trim().toLowerCase(),
      allowedAddresses: allowed,
      notes: notes.trim() || null,
    })
  }

  return (
    <FormModal title={`Edit ${item.name}`} onClose={onClose} isLoading={updateMutation.isPending}>
      <div className='space-y-3'>
        <Field label='Original owner (stolen from)'>
          <input
            type='text'
            value={originalOwner}
            onChange={(e) => setOriginalOwner(e.target.value)}
            className='w-full font-mono text-sm'
          />
        </Field>
        <Field
          label='Recovery wallets'
          hint={`Replaces the full list. One per line, max ${MAX_ALLOWED_ADDRESSES}.`}
        >
          <textarea
            value={allowedText}
            onChange={(e) => setAllowedText(e.target.value)}
            rows={4}
            className='w-full font-mono text-sm'
          />
        </Field>
        <Field label='Notes'>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className='w-full' />
        </Field>

        {formError && <p className='text-error text-sm'>{formError}</p>}

        <div className='flex gap-3 pt-2'>
          <button onClick={onClose} disabled={updateMutation.isPending} className='btn btn-secondary flex-1'>
            Cancel
          </button>
          <button onClick={submit} disabled={updateMutation.isPending} className='btn btn-primary flex-1'>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </FormModal>
  )
}
