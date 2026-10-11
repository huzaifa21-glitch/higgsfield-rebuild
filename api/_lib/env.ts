// `vercel dev` doesn't pass .env.local to functions in a linked project (only the Vercel project's own
// Development variables), so load it ourselves when running locally. Never on deployments, and
// loadEnvFile doesn't override variables that are already set.
const local = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development'
if (local) {
  try {
    process.loadEnvFile('.env.local')
  } catch {
    // No .env.local: rely on whatever the environment provides.
  }
}

export {}
