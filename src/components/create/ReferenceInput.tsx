import { useRef, useState, type DragEvent } from 'react'
import { fileToDataUrl } from '../../lib/api.ts'

export type Reference =
  | { kind: 'upload'; dataUrl: string; name: string }
  | { kind: 'job'; jobId: string; url: string }
  | { kind: 'character'; characterId: string; url: string; name: string }

type Props = {
  value: Reference | null
  onChange: (value: Reference | null) => void
  label: string
}

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
// Checked before the in-browser resize; the server re-checks type and size.
const MAX_BYTES = 8 * 1024 * 1024

function ReferenceInput({ value, onChange, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function take(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!ACCEPT.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 8MB.`)
      return
    }
    setBusy(true)
    try {
      onChange({ kind: 'upload', dataUrl: await fileToDataUrl(file, 512), name: file.name })
    } catch {
      setError("Couldn't read that image.")
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void take(e.dataTransfer.files[0])
  }

  if (value) {
    const src = value.kind === 'upload' ? value.dataUrl : value.url
    const detail = value.kind === 'upload' ? value.name : value.kind === 'character' ? 'Character' : 'From your results'
    return (
      <div className="ref-preview">
        <img src={src} alt={value.kind === 'character' ? `Photo of ${value.name}` : 'Your reference photo'} />
        <div className="ref-meta">
          <span>{value.kind === 'character' ? value.name : label}</span>
          <small>{detail}</small>
        </div>
        <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Remove reference image">
          ×
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={busy}
      >
        <span className="dropzone-icon" aria-hidden="true">
          +
        </span>
        <span>{busy ? 'Preparing…' : label}</span>
        <small>Drop an image or click to browse</small>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </>
  )
}

export default ReferenceInput
