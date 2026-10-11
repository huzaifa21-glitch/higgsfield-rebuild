# Capture Test

## Tool and model

- **Tool:** Claude Code CLI, v2.1.296, on Windows 11 (hooks run via Git Bash)
- **Model:** `claude-opus-5-5` (Opus 5.5) does both the planning and the execution. No separate planner model, and no subagents were used for setup.
- **Hook mechanism:** yes. Claude Code has lifecycle hooks configured in `settings.json`. They fire automatically on `UserPromptSubmit` (every prompt) and `Stop` (end of every turn).

## Mechanism

- **Config file changed:** `.claude/settings.json` (project-level and committed, so it applies to every session opened in this repo)
- **Script:** `.claude/hooks/capture.mjs` (Node, no dependencies)
  - `UserPromptSubmit` → `node capture.mjs prompt`: appends the `prompt` field from the hook's stdin JSON verbatim, with a UTC timestamp.
  - `Stop` → `node capture.mjs response`: reads `transcript_path` from stdin and takes the assistant text that comes after the turn's last user/tool_result entry. That is the final response only. Thinking, tool calls and intermediate narration are excluded. The model name comes from that transcript message.
  - One file per session: `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`. Entries are append-only, and only the frontmatter (exchange count, last prompt time, models seen) is rewritten.
  - If the hook becomes active partway through a session, earlier turns are backfilled from the transcript and tagged `source: transcript-backfill`.
  - Failures never block the session. They go to `.agent-logs/.capture-errors.txt`.

## Canary log file(s)

<!-- TODO after canaries: paths -->

## Canary 1 (session 1), raw

<!-- TODO -->

## Canary 2 (session 2), raw

<!-- TODO -->

## What didn't work first / notes

- **The prompt hook can't see the model.** I dumped the raw stdin of `SessionStart` and `UserPromptSubmit` in a throwaway session. Neither includes a model field. Only the transcript's assistant messages carry it. So the first PROMPT of a session (before any assistant reply exists) resolves its model from `ANTHROPIC_MODEL` or a `model` setting. Failing those, it infers the model from this project's previous transcript and tags it `(inferred …)`. Every later entry, and every RESPONSE, uses the model actually recorded in the transcript.
- **The first build lost the current prompt.** When the Stop hook was the one that created the session file, it skipped the current turn's PROMPT. Found it by testing that path directly, then fixed it.
- **Botched regex.** I patched the script through a shell heredoc, and that dropped the backslashes in the regex that strips the `(inferred …)` note from the frontmatter. Fixed with a direct edit.
- **Smoke-test logs left in.** Before the canaries I ran three headless `claude -p` sessions: two smoke tests and one stdin dump. Their logs are still in `.agent-logs/` (`f97f15b4`, `73812e25`, `2a096642`). I didn't delete them.
- **Unrelated `.gitignore` fix.** Its last line was UTF-16 (`. e n v *` with null bytes), so `.env*` and `.vercel` weren't being ignored. I rewrote it as plain UTF-8.
- **Setup session start.** The session that set this up (pasting the brief and installing the hook) began before the hook existed. Its first turn is only in the log if the hook hot-loaded mid-session, in which case it's tagged `transcript-backfill`.
