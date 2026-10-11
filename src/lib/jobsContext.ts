import { createContext, useContext } from 'react'
import type { CreateJobResult, Job, JobType, NewJob, SiteStatus } from './api.ts'

export type JobsState = {
  jobs: Job[]
  // True once the first job list has arrived, so 'no jobs yet' can be told apart from 'still loading'.
  loaded: boolean
  credits: number | null
  costs: Record<JobType, number> | null
  error: string | null
  live: boolean
  createJob: (input: NewJob) => Promise<CreateJobResult>
  // This network already used its 3 free sessions today: this session started with 0 credits.
  starterWithheld: boolean
  // Workers AI is out of free capacity: image/effect jobs return demo outputs until 'until'.
  degraded: SiteStatus['degraded']
  // Rate-limited until this time (ms epoch), or null.
  cooldownUntil: number | null
}

export const JobsContext = createContext<JobsState | null>(null)

// This session's jobs and credits, kept live over Realtime. Must be used under <JobsProvider>.
export function useJobs() {
  const state = useContext(JobsContext)
  if (!state) throw new Error('useJobs must be used inside <JobsProvider>')
  return state
}
