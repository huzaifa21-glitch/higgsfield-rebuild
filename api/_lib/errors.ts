// Every job failure is reduced to one of these codes before it is stored or sent to the browser.
// The raw provider message only ever goes to the server log.
export type JobErrorCode =
  | 'safety_filter' // Workers AI 3030: output flagged
  | 'quota' // Workers AI 3036: daily free allocation used up
  | 'capacity' // Workers AI 3040 / other 429: temporarily out of capacity
  | 'timeout' // provider too slow, or 3007/3008
  | 'invalid_input' // unreadable image, bad prompt, Workers AI 5006/5004/3003/3006
  | 'no_samples' // mock video provider has no clips to serve
  | 'stuck' // queued/running too long, swept by GET /api/jobs
  | 'provider_error' // anything else

export class JobError extends Error {
  readonly code: JobErrorCode

  constructor(code: JobErrorCode, detail: string) {
    super(detail)
    this.name = 'JobError'
    this.code = code
  }
}

export const toJobError = (err: unknown): JobError =>
  err instanceof JobError ? err : new JobError('provider_error', err instanceof Error ? err.message : JSON.stringify(err))
