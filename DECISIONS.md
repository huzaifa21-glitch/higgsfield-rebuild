# Decisions

What I'm rebuilding, why, and what I'm deliberately leaving out. Source material: my hands-on walkthrough in [`docs/research/notes.md`](docs/research/notes.md) and the screenshots alongside it.

## What Higgsfield is

Higgsfield is a consumer AI creative studio for generating images and short videos. Logged-out users land on an Explore feed of generated videos with a sign-in/sign-up button top right (Google, email, etc.). After sign-up you go straight to the generation screen. Around that core it stacks a lot of product surface: many image and video models (with heavy branding around its newest model, Genjutsu), one-click Effects, persistent Characters / AI influencers, motion transfer ("action copying", where an avatar copies your movements), Ads Studio, plugins with MCP server support, a community showcase, and contests. All of it runs on a credit system, and new accounts get roughly 10 credits.

## Friction I found

1. **No guided first creation.** After sign-up you land on a generation screen with no clear "make your first thing" path. There may be a tutorial, but if so it was easy to skip and I don't remember it. A new user is left to work out models, settings and prompts alone.
2. **Surprise paywall redirect.** I wrote a prompt and believed I had enough credits for one image. When I didn't, the app sent me straight to the pricing page with no warning and no cheaper option. Cost was invisible until it blocked me, and the starting 10 credits aren't enough to make anything worthwhile.
3. **25–30 navigation items.** The surface area is overwhelming. Most of it doesn't matter for someone trying to make their first image.
4. **Prompt adherence is unreliable.** After switching to a cheaper model I generated three images from the exact same prompt. Only the first roughly followed it. The other two missed the core subject and focused on a side detail. The user can't tell why, and nothing helps them fix it.

Worth keeping from the original: the AI influencer / motion-copy concept, MCP support through plugins, and the community feed, which is genuinely compelling ("feels like Netflix"). These fed into the cut list below. They're good ideas, but not ones I can do well within this scope.

## What I'm building, in priority order

Each item depends on the ones above it. If time runs out, I cut from the bottom.

1. **Generation pipeline.** A job-based backend (`api/jobs.ts`): create job → provider call → store output → poll status. Credits are reserved when a job is created, then committed on success or refunded on failure. Everything else depends on this.
2. **Create, with visible cost and Prompt Assist.** The main image screen.
   - *Visible cost:* the credit price appears on the Generate button and updates as settings change, next to your balance. If you can't afford it, the button says so before you click. No redirect.
   - *Prompt Assist:* rewrites a rough prompt into a structured one that puts the main subject first. This responds directly to friction #4, where variations drifted to side details.
3. **Effects, with a guided first run.** A small set of preset effects. A first-time user is walked through one with a pre-filled example, so they finish their first creation within about a minute of signing up. Responds to friction #1.
4. **Library, with remix and image→video.** Everything you've made in one place. *Remix* reopens the original prompt and settings so you can iterate. *Image→video* animates a still through a **mock video provider** (see cuts) that uses the same job flow, so a real provider can be dropped in later.
5. **Characters.** Save a reference subject and reuse it across generations through the image-edit provider. This is a lightweight version of the AI influencer idea I liked.
6. **Guest credits and guards.** Visitors can try one generation before signing up, using a small guest credit allowance tied to a session. Server-side guards cover balance checks, per-session rate limits and prompt length/content checks, so the free tier can't be drained.
7. **Stretch: public outputs.** Opt-in sharing of individual outputs via a public link. This is the seed of a community feed, without building the feed itself.

Navigation stays at **five items or fewer**: Create, Effects, Library, Characters, plus account/credits. Responds to friction #3.

## What I'm cutting, and why

| Cut | Why |
|---|---|
| **Genjutsu / real video generation** | Video models are expensive per second and there's no free tier I can rely on. Image→video goes through a mock provider behind the same adapter, so the UX is real and the backend can be swapped later. |
| **Ads Studio** | A separate product for a separate audience (marketers). It adds navigation weight without improving the core create loop. |
| **Katana** | Another specialised tool on top of the core loop. Not needed to show the first-creation experience I'm fixing. |
| **AI Influencer studio** | Good idea, but it needs real video, motion transfer and consistent identity across many generations. **Characters** keeps the core of it (a reusable subject) at a scope I can ship. |
| **MCP / plugins** | A power-user extension point. It only matters once the base product is good. |
| **Community** | The best part of the original, but a feed needs moderation, ranking and a critical mass of content. *Public outputs* (stretch) lays the groundwork. |
| **Contests** | Depends on community, and adds rules, judging and prizes. |
| **Payments** | Real billing (Stripe, tax, refunds) is a project of its own. The credit ledger is real; buying credits isn't. The point is to fix how cost is *shown*, not to build checkout. |
| **Audio** | A separate modality with its own models and UX. Out of scope for an image-first rebuild. |

## Zero budget: Cloudflare Workers AI behind a provider adapter

**Constraint:** this project has no budget for inference.

**Choice:** use **Cloudflare Workers AI** for real image generation and image editing. Its free daily allocation covers development and demo traffic, it runs current open image models, and it can be called over REST from the Vercel functions in `api/`, so I don't have to move hosting.

**Adapter:** the job pipeline never calls a vendor directly. Each provider implements one small interface (submit a job, return an output or status), and the pipeline chooses a provider by capability:

- `api/_lib/providers/cloudflare-image.ts`: text→image (Create, Effects)
- `api/_lib/providers/cloudflare-edit.ts`: image→image (Characters, edit-style Effects)
- `api/_lib/providers/mock-video.ts`: image→video (Library), returns a canned or generated clip after a realistic delay

**Why the adapter matters:** model quality and cost will change. Swapping Cloudflare for a paid provider, or the mock for a real video model, should only touch a provider file and a config entry. Credit prices live with each provider, so the visible cost on the Generate button always matches what the backend will charge.

**Trade-offs I'm accepting:** open models follow prompts less reliably than Higgsfield's top models. That's one reason Prompt Assist is high on the list. I'm also accepting free-tier rate limits, which the guest and per-session guards help absorb, and video that isn't real.

## Model validation

Before writing the image-edit provider, I tested `@cf/black-forest-labs/flux-2-klein-4b` against a real selfie with `scripts/test-models.ts` and `scripts/klein-grid.ts`. Outputs go to `scripts/out/`, which is git-ignored.

**A vague prompt gave a weak edit.** With "turn this person into a film noir detective" and no fixed seed, the results ranged from a full noir detective to the original photo with darker lighting. One run had no hat or coat at all.

**A specific prompt fixed it at every setting.** I ran a grid with seed 42 and this prompt: "the same person as a 1940s film noir detective, wearing a fedora and trench coat, black-and-white, rain-soaked street at night, dramatic shadows". It covered two input sizes (512px and 1024px longest side) and three guidance values (2.5, 5, 8). All six outputs were convincing noir detectives, with the fedora, trench coat, black-and-white look and rainy street, and the person's face was preserved in every one. The prompt mattered far more than any parameter. This backs **Prompt Assist** as a core feature, not a nice-to-have, and Effects should ship with specific, tested prompts.

**Guidance 5.** At 2.5 the result was weaker: a wider shot, a lighter coat and a less noir look. 5 and 8 were nearly identical, so raising guidance past 5 adds nothing. klein-4b has no `strength` parameter, and `steps` is fixed at 4, so guidance and the prompt are the only controls.

**512px input, chosen on cost.** Cloudflare's docs say input images "must be smaller than 512x512". The API accepted larger ones (up to 2448×3264), but the 1024px input wasn't clearly better, just a tighter crop, and it cost ~15% more. Inputs are resized so the longest side is 512px, keeping the aspect ratio and applying the photo's rotation data.

**About 110 neurons per effect.** Cloudflare's published rates are 5.37 neurons per input 512×512 tile and 26.05 per output tile. A 512px input with a 768×1024 output comes to **≈110 neurons** (≈$0.0012 on the paid plan). That's roughly **90 effects a day** within the 10,000-neuron free tier. The output accounts for about 95% of the cost, so output resolution is the lever for credit pricing.

**Caveats:**
- **One seed:** each grid cell was a single run.
- **Upscaled 1024px input:** the source photo was 365×547, so the 1024px input was upscaled and carried no extra detail. A real high-resolution photo might do better.
- **Tile rounding:** the neuron estimate assumes partial tiles round up. If Cloudflare bills by exact area, the real cost is closer to ~80 neurons. Check this against the Workers AI dashboard before fixing credit prices.

## Guards

The app runs on free tiers with guest sessions and no sign-up, so it needs its own limits. None of these add a paid service: counters and flags live in Supabase tables (`supabase/guards.sql`).

| Guard | What it does | Why |
|---|---|---|
| **Session farming** | Each session stores a salted SHA-256 of the client IP, never the raw IP. A network gets starter credits on at most 3 new sessions per 24h; after that a new session starts at 0 credits, with a banner explaining why. | Clearing cookies would otherwise mint 10 free credits every time, and those credits are real Workers AI neurons. Three per day leaves room for a household or a shared office. |
| **Rate limit** | At most 6 job creations per IP per minute on `POST /api/jobs`, counted in a fixed-window table with one atomic upsert. Over the limit returns `429` with `Retry-After`, and the Generate buttons count down ("Slow down · try again in 12s"). | Caps how fast one client can burn through the shared free allocation, even with credits in hand. It is checked before validation, so a flood never reaches the database or the models. If the counter itself fails, requests are allowed rather than blocking everyone. |
| **Daily quota fallback** | If Workers AI returns 3036 (daily free allocation used up) or 3040/429 (out of capacity), image and effect jobs are served by a mock provider instead of failing: effects get that preset's gallery preview, and images get one of six pre-made samples. The job is marked `is_demo` and its credits are refunded. A global `ai_degraded` flag (until 00:00 UTC for quota, 10 minutes for capacity) skips Cloudflare entirely while it lasts and drives a site-wide banner. | The free tier will run out on a busy day. A demo output with an honest banner is a better experience than a wall of failures, and refunding means nobody pays for a sample. |
| **Stuck jobs** | Whenever `GET /api/jobs` runs, any of that session's jobs queued or running for more than 2 minutes is marked failed and refunded. | A job can be lost if the function is killed mid-run. The provider timeout (45s) and `maxDuration` (60s) make 2 minutes a safe cut-off, and checking lazily needs no cron job. |
| **Input validation** | Prompts are limited to 1000 characters. Uploads must be JPEG, PNG or WebP and at most 8MB before the in-browser resize. The server re-checks the declared type, the size and the actual bytes (via sharp), so a GIF or a renamed text file is rejected even if the client is bypassed. | Never trust the client. Bad input should fail fast with a clear message, not as a model error after credits are spent. |
| **Error mapping** | Every failure is reduced to a code (`safety_filter`, `quota`, `capacity`, `timeout`, `stuck`, `invalid_input`, `no_samples`, `provider_error`) before it's stored, and each code has one human message on the card. Raw provider errors and stack traces go only to the server log. API errors return plain sentences, and unexpected ones return a generic 500. | Raw errors confuse people, and they can leak internals. A specific message tells the user what to do next, e.g. "The safety filter blocked this result. Try a different photo, prompt or effect." |
