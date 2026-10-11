import { useEffect, useState } from 'react'
import { useJobs } from './jobsContext.ts'

// Seconds left on a rate-limit cooldown (0 when none), ticking down live.
export function useCooldown() {
  const { cooldownUntil } = useJobs()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!cooldownUntil) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [cooldownUntil])

  return cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0
}
