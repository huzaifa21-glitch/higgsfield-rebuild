import { useEffect } from 'react'

// Sets the tab title for the current page: "<title> · Morph".
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Morph` : 'Morph · Turn any photo into…'
  }, [title])
}
