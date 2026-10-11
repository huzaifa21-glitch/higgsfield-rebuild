import { useRef, useState, type DragEvent } from 'react'
import { fileToDataUrl } from '../../lib/api.ts'

export type Reference =
  | { kind: 'upload'; dataUrl: string; name: string }
  | { kind: 'job'; jobId: string; url: string }

type Props = {
  value: Reference | null
  onChange: (value: Reference | null) => void
  label: string
}

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']

function ReferenceInput({ value, onChange, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function take(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!ACCEPT.includes(file.type)) {
      setError('Use a PNG, JPEG or WebP image.')
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
    return (
      <div className="ref-preview">
        <img src={src} alt="Reference" />
        <div className="ref-meta">
          <span>{label}</span>
          <small>{value.kind === 'upload' ? value.name : 'From your results'}</small>
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
