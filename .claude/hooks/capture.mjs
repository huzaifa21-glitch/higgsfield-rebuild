#!/usr/bin/env node
// Claude Code capture hook for the 8x assignment.
//
//   UserPromptSubmit -> `node capture.mjs prompt`    appends the prompt, verbatim
//   Stop             -> `node capture.mjs response`  appends the final assistant text of the turn
//
// One file per session: .agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md
// Entries are append-only. Only the frontmatter (counts, last time, models seen) is rewritten.
// If the session file doesn't exist yet but the transcript already holds earlier turns
// (hook installed mid-session), those turns are backfilled from the transcript first,
// tagged `source: transcript-backfill`.
//
// This script must never break the session: every failure is swallowed and exits 0.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const MODE = process.argv[2]; // 'prompt' | 'response'
const TOOL = 'claude-code';

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function readTranscript(p) {
  if (!p || !fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // partially-written last line; ignore
    }
  }
  return out;
}

const isAssistant = (e) => e.type === 'assistant' && e.message;
const isUser = (e) => e.type === 'user' && e.message && !e.isMeta && !e.isCompactSummary;

// A real prompt (typed by the human), as opposed to a tool_result fed back to the model.
function promptText(e) {
  if (!isUser(e)) return null;
  const c = e.message.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c) || c.some((b) => b.type === 'tool_result')) return null;
  const text = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
  return text || null;
}

function assistantText(e) {
  const c = e.message.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
}

function modelOf(e) {
  const m = e?.message?.model;
  return m && m !== '<synthetic>' ? m : null;
}

function latestModel(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isAssistant(entries[i]) && modelOf(entries[i])) return modelOf(entries[i]);
  }
  return null;
}

// Final response of a turn = assistant text after the last user-role entry
// (prompt or tool_result) in that turn. Intermediate narration before tool calls is excluded.
function finalOfSlice(slice) {
  let lastUser = -1;
  slice.forEach((e, i) => {
    if (isUser(e)) lastUser = i;
  });
  const tail = slice.slice(lastUser + 1).filter(isAssistant);
  const parts = tail.map(assistantText).filter((t) => t.trim());
  const last = tail.filter((e) => assistantText(e).trim()).at(-1) || tail.at(-1);
  return {
    text: parts.join('\n\n'),
    timestamp: last?.timestamp || null,
    model: modelOf(last) || latestModel(slice),
  };
}

// Split the transcript into turns: [{prompt, promptTs, response:{text,timestamp,model}}]
function turns(entries) {
  const idx = [];
  entries.forEach((e, i) => {
    if (promptText(e) !== null) idx.push(i);
  });
  return idx.map((start, k) => {
    const end = k + 1 < idx.length ? idx[k + 1] : entries.length;
    const slice = entries.slice(start, end);
    return {
      prompt: promptText(entries[start]),
      promptTs: entries[start].timestamp,
      model: latestModel(entries.slice(0, end)),
      response: finalOfSlice(slice),
    };
  });
}

// UserPromptSubmit input carries no model, so the first prompt of a session has to resolve it
// from config, or infer it from this project's most recent other transcript (tagged as inferred).
function configuredModel(projectDir, transcriptPath) {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  for (const p of [
    path.join(projectDir, '.claude', 'settings.local.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(home, '.claude', 'settings.json'),
  ]) {
    try {
      const m = JSON.parse(fs.readFileSync(p, 'utf8')).model;
      if (m) return `${m} (from settings)`;
    } catch {}
  }
  try {
    const dir = path.dirname(transcriptPath);
    const others = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.jsonl') && path.join(dir, n) !== path.resolve(transcriptPath))
      .map((n) => path.join(dir, n))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const p of others.slice(0, 5)) {
      const m = latestModel(readTranscript(p));
      if (m) return `${m} (inferred from previous session; hook input has no model field)`;
    }
  } catch {}
  return null;
}

function author(projectDir) {
  try {
    const url = execSync('git config --get remote.origin.url', { cwd: projectDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const m = url.match(/github\.com[:/]([^/]+)\//);
    if (m) return m[1];
  } catch {}
  try {
    return execSync('git config user.name', { cwd: projectDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {}
  return 'unknown';
}

function stamp(iso) {
  // 2026-08-28T09:14:02.118Z -> 2026-08-28_09-14-02
  return iso.slice(0, 19).replace('T', '_').replace(/:/g, '-');
}

function findSessionFile(logDir, sessionId) {
  if (!fs.existsSync(logDir)) return null;
  const f = fs.readdirSync(logDir).find((n) => n.endsWith(`_${sessionId}.md`));
  return f ? path.join(logDir, f) : null;
}

function entry(type, num, short, ts, model, text, extra = '') {
  return `[LOG_ENTRY type=${type} num=${num} session=${short}]\ntimestamp: ${ts}\nmodel: ${model || 'unknown'}\n${extra}\n${text}\n\n\n`;
}

function parseFile(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw };
}

function renderFrontmatter(meta) {
  const keys = [
    'session_id',
    'date',
    'author',
    'model',
    'tool',
    'project',
    'total_exchanges',
    'first_prompt_time',
    'last_prompt_time',
  ];
  return `---\n${keys.map((k) => `${k}: ${meta[k] ?? ''}`).join('\n')}\n---\n`;
}

function addModel(meta, model) {
  if (!model) return;
  model = model.replace(/ \(.*\)$/, '');
  const seen = (meta.model || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!seen.includes(model)) seen.push(model);
  meta.model = seen.join(', ');
}

function main() {
  const input = readStdin();
  const sessionId = input.session_id;
  if (!sessionId || !['prompt', 'response'].includes(MODE)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logDir = path.join(projectDir, '.agent-logs');
  fs.mkdirSync(logDir, { recursive: true });
  const short = sessionId.slice(0, 8);
  const now = new Date().toISOString();

  let entries = readTranscript(input.transcript_path);
  const inputModel = typeof input.model === 'string' ? input.model : input.model?.id;

  let file = findSessionFile(logDir, sessionId);
  let meta, body;
  if (file) {
    ({ meta, body } = parseFile(file));
  } else {
    const project = path.basename(projectDir);
    const firstTs = turns(entries)[0]?.promptTs || now;
    const handle = author(projectDir);
    file = path.join(logDir, `${stamp(firstTs)}_${sessionId}.md`);
    meta = {
      session_id: sessionId,
      date: firstTs.slice(0, 10),
      author: handle,
      model: '',
      tool: TOOL,
      project,
      total_exchanges: 0,
      first_prompt_time: '',
      last_prompt_time: '',
    };
    body =
      `\n# Session Log - ${meta.date}\n\n` +
      `Session: \`${short}\` | Project: \`${project}\` | Author: \`${handle}\`\n\n---\n\n`;

    // Backfill turns that happened before the hook was active in this session.
    let prior = turns(entries);
    if (MODE === 'prompt' && prior.at(-1)?.prompt === input.prompt) prior = prior.slice(0, -1);
    const tag = 'source: transcript-backfill (hook not yet active when this turn ran)\n';
    prior.forEach((t, i) => {
      const n = Number(meta.total_exchanges) + 1;
      meta.total_exchanges = n;
      meta.first_prompt_time ||= t.promptTs;
      meta.last_prompt_time = t.promptTs;
      addModel(meta, t.model);
      body += entry('PROMPT', n, short, t.promptTs, t.model, t.prompt, tag);
      // In response mode the current turn's RESPONSE is appended below, from the live Stop event.
      if (MODE === 'prompt' || i < prior.length - 1) {
        body += entry('RESPONSE', n, short, t.response.timestamp, t.response.model, t.response.text, tag);
      }
    });
  }

  if (MODE === 'prompt') {
    const model =
      inputModel ||
      latestModel(entries) ||
      meta.model.split(',').at(-1)?.trim() ||
      configuredModel(projectDir, input.transcript_path);
    const n = Number(meta.total_exchanges || 0) + 1;
    meta.total_exchanges = n;
    meta.first_prompt_time ||= now;
    meta.last_prompt_time = now;
    addModel(meta, model);
    body += entry('PROMPT', n, short, now, model, input.prompt ?? '');
  } else {
    // The transcript can lag the Stop event slightly; wait for the final text to land.
    let resp = finalOfSlice(entries.slice(entries.findLastIndex((e) => promptText(e) !== null)));
    for (let i = 0; i < 20 && !resp.text.trim(); i++) {
      sleep(250);
      entries = readTranscript(input.transcript_path);
      resp = finalOfSlice(entries.slice(entries.findLastIndex((e) => promptText(e) !== null)));
    }
    // Stop hooks can also get the final text directly in newer versions.
    const text = resp.text.trim() ? resp.text : input.last_assistant_message || '';
    const model = resp.model || inputModel || latestModel(entries);
    addModel(meta, model);
    const n = Number(meta.total_exchanges || 0);
    body += entry('RESPONSE', n, short, resp.timestamp || now, model, text);
  }

  fs.writeFileSync(file, renderFrontmatter(meta) + body);
}

try {
  main();
} catch (err) {
  try {
    fs.appendFileSync(
      path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.agent-logs', '.capture-errors.txt'),
      `${new Date().toISOString()} ${MODE} ${err?.stack || err}\n`,
    );
  } catch {}
}
process.exit(0);
