import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchJobs, fetchSession, postJob, type CreateJobResult, type Job, type JobType, type NewJob } from './api.ts'
import { JobsContext } from './jobsContext.ts'
import { supabase } from './supabase.ts'

function upsert(jobs: Job[], job: Job) {
  const rest = jobs.filter((j) => j.id !== job.id)
  return [job, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// One Realtime subscription for the whole app (channel jobs:<realtimeKey>), shared by the nav's
// credit counter and every page that shows jobs.
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [costs, setCosts] = useState<Record<JobType, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [loaded, setLoaded] = useState(false)

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
        setLoaded(true)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Fallback if Realtime is down: poll while anything is still in flight, so cards never hang.
  const pending = jobs.some((j) => !j.id.startsWith('temp-') && (j.status === 'queued' || j.status === 'running'))
  useEffect(() => {
    if (live || !pending) return
    const id = setInterval(() => {
      fetchJobs()
        .then((fetched) => setJobs((prev) => fetched.reduce(upsert, prev.filter((j) => j.id.startsWith('temp-')))))
        .catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [live, pending])

  const createJob = useCallback(
    async (input: NewJob) => {
      // Optimistic card and balance so the click feels instant; replaced by the server's job below.
      const cost = costs?.[input.type] ?? 0
      const tempId = `temp-${crypto.randomUUID()}`
      const temp: Job = {
        id: tempId,
        type: input.type,
        status: 'queued',
        preset_id: input.preset_id ?? null,
        character_id: input.character_id ?? null,
        prompt: input.prompt,
        enhanced_prompt: input.enhanced_prompt ?? null,
        input_url: null,
        parent_job_id: input.parent_job_id ?? null,
        model: '',
        params: input.params ?? {},
        cost,
        output_url: null,
        is_demo: false,
        error: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      }
      setJobs((prev) => upsert(prev, temp))
      setCredits((c) => (c === null ? c : c - cost))

      const result: CreateJobResult = await postJob(input).catch((err: unknown) => ({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      }))
      setJobs((prev) => {
        const rest = prev.filter((j) => j.id !== tempId)
        return result.ok ? upsert(rest, result.job) : rest
      })
      if (result.ok) setCredits(result.credits)
      else if (result.credits !== undefined) setCredits(result.credits)
      else setCredits((c) => (c === null ? c : c + cost))
      return result
    },
    [costs],
  )

  const value = useMemo(
    () => ({ jobs, loaded, credits, costs, error, live, createJob }),
    [jobs, loaded, credits, costs, error, live, createJob],
  )
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
