import { useCallback, useEffect, useState } from 'react'
import { fetchJobs, fetchSession, postJob, type Job, type JobType, type NewJob } from './api.ts'
import { supabase } from './supabase.ts'

function upsert(jobs: Job[], job: Job) {
  const rest = jobs.filter((j) => j.id !== job.id)
  return [job, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// This session's jobs and credits, kept live by the Realtime broadcast channel jobs:<realtimeKey>.
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [costs, setCosts] = useState<Record<JobType, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | undefined

    fetchSession()
      .then(async (session) => {
        if (cancelled) return
        setCredits(session.credits)
        setCosts(session.costs)

        // Subscribe before the first fetch so no update falls in the gap.
        channel = supabase
          .channel(`jobs:${session.realtimeKey}`)
          .on('broadcast', { event: 'job' }, ({ payload }) => setJobs((prev) => upsert(prev, payload as Job)))
          .on('broadcast', { event: 'credits' }, ({ payload }) => setCredits((payload as { credits: number }).credits))
          .subscribe((status) => setLive(status === 'SUBSCRIBED'))

        const fetched = await fetchJobs()
        if (cancelled) return
        // Anything Realtime delivered while the fetch was in flight is newer, so it wins.
        setJobs((prev) => prev.reduce(upsert, fetched))
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const createJob = useCallback(async (input: NewJob) => {
    const result = await postJob(input)
    if (result.ok) {
      setJobs((prev) => upsert(prev, result.job))
      setCredits(result.credits)
    } else if (result.credits !== undefined) {
      setCredits(result.credits)
    }
    return result
  }, [])

  return { jobs, credits, costs, error, live, createJob }
}
