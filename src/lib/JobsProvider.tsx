import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fetchJobs,
  fetchSession,
  fetchStatus,
  postJob,
  type CreateJobResult,
  type Job,
  type JobType,
  type NewJob,
  type SiteStatus,
} from './api.ts'
import { JobsContext } from './jobsContext.ts'
import { supabase } from './supabase.ts'
import { useToast } from './toastContext.ts'

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
  const [starterWithheld, setStarterWithheld] = useState(false)
  const [degraded, setDegraded] = useState<SiteStatus['degraded']>(null)
  // Set from a 429's retry_after; generate buttons count down until it passes.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const toast = useToast()
  // Jobs already known to be refunded, so each refund is announced once (and never for old jobs).
  const refundsSeen = useRef(new Set<string>())

  const refreshStatus = useCallback(() => {
    fetchStatus()
      .then((s) => setDegraded(s.degraded))
      .catch(() => {})
  }, [])

  // Degraded mode can start at any time, so check now, every minute, and whenever a demo fallback arrives.
  useEffect(() => {
    refreshStatus()
    const id = setInterval(refreshStatus, 60_000)
    return () => clearInterval(id)
  }, [refreshStatus])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | undefined

    fetchSession()
      .then(async (session) => {
        if (cancelled) return
        setCredits(session.credits)
        setCosts(session.costs)
        setStarterWithheld(Boolean(session.starterWithheld))

        // Subscribe before the first fetch so no update falls in the gap.
        channel = supabase
          .channel(`jobs:${session.realtimeKey}`)
          .on('broadcast', { event: 'job' }, ({ payload }) => {
            const job = payload as Job
            setJobs((prev) => upsert(prev, job))
            if (job.refunded && job.cost > 0 && !refundsSeen.current.has(job.id)) {
              refundsSeen.current.add(job.id)
              const amount = `${job.cost} ${job.cost === 1 ? 'credit' : 'credits'}`
              toast(job.status === 'failed' ? `Didn't work out, so ${amount} refunded` : `Demo output, so ${amount} refunded`, 'info')
            }
            if (job.status === 'done' && job.is_demo && job.type !== 'video') refreshStatus()
          })
          .on('broadcast', { event: 'credits' }, ({ payload }) => setCredits((payload as { credits: number }).credits))
          .subscribe((status) => setLive(status === 'SUBSCRIBED'))

        const fetched = await fetchJobs()
        if (cancelled) return
        for (const j of fetched) if (j.refunded) refundsSeen.current.add(j.id)
        // Anything Realtime delivered while the fetch was in flight is newer, so it wins.
        setJobs((prev) => prev.reduce(upsert, fetched))
        setLoaded(true)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [refreshStatus, toast])

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
        refunded: false,
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
      if (!result.ok && result.status === 429) setCooldownUntil(Date.now() + (result.retryAfter ?? 10) * 1000)
      else setCredits((c) => (c === null ? c : c + cost))
      return result
    },
    [costs],
  )

  // The cooldown clears itself once it has passed.
  useEffect(() => {
    if (!cooldownUntil) return
    const id = setTimeout(() => setCooldownUntil(null), Math.max(0, cooldownUntil - Date.now()))
    return () => clearTimeout(id)
  }, [cooldownUntil])

  const value = useMemo(
    () => ({ jobs, loaded, credits, costs, error, live, createJob, starterWithheld, degraded, cooldownUntil }),
    [jobs, loaded, credits, costs, error, live, createJob, starterWithheld, degraded, cooldownUntil],
  )
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
