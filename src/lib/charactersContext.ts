import { createContext, useContext } from 'react'
import type { Character, CharacterResult } from './api.ts'

export type CharactersState = {
  characters: Character[]
  limit: number
  loaded: boolean
  error: string | null
  reload: () => void
  create: (name: string, image: string) => Promise<CharacterResult>
  rename: (id: string, name: string) => Promise<CharacterResult>
  remove: (id: string) => Promise<boolean>
}

export const CharactersContext = createContext<CharactersState | null>(null)

export function useCharacters() {
  const state = useContext(CharactersContext)
  if (!state) throw new Error('useCharacters must be used inside <CharactersProvider>')
  return state
}
