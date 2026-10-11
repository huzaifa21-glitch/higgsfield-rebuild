import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createCharacter, deleteCharacter, fetchCharacters, fetchSession, renameCharacter, type Character } from './api.ts'
import { CharactersContext } from './charactersContext.ts'

// The session's saved characters, shared by Characters, Create, Effects and the Library.
export function CharactersProvider({ children }: { children: ReactNode }) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [limit, setLimit] = useState(3)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Wait for the session so the first visit doesn't create two sessions in parallel.
    fetchSession()
      .then(() => fetchCharacters())
      .then((data) => {
        if (cancelled) return
        setCharacters(data.characters)
        setLimit(data.limit)
        setLoaded(true)
      })
      .catch(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  const create = useCallback(async (name: string, image: string) => {
    const result = await createCharacter(name, image)
    if (result.ok) setCharacters((prev) => [...prev, result.character])
    return result
  }, [])

  const rename = useCallback(async (id: string, name: string) => {
    const result = await renameCharacter(id, name)
    if (result.ok) setCharacters((prev) => prev.map((c) => (c.id === id ? result.character : c)))
    return result
  }, [])

  const remove = useCallback(async (id: string) => {
    const ok = await deleteCharacter(id)
    if (ok) setCharacters((prev) => prev.filter((c) => c.id !== id))
    return ok
  }, [])

  const value = useMemo(() => ({ characters, limit, loaded, create, rename, remove }), [characters, limit, loaded, create, rename, remove])
  return <CharactersContext.Provider value={value}>{children}</CharactersContext.Provider>
}
