/**
 * Skill catalog refresh — Host half.
 *
 * The Web `/` skill catalog is cached per client session by
 * `@deepseek-ai/dsh-client-ui-skill`. That cache is cleared only by
 * `agent-preset/selected`, `plugin-manager/changed`, or `connection/reset`, and
 * installing or removing a `SKILL.md` on disk reaches no client: the skill
 * registry does announce `skills/change` on the Host, but that event is not in
 * the forwarded-event allowlist of `@deepseek-ai/dsh-api-remotes`
 * (`src/remote-events.ts`), so clients never hear it.
 *
 * This plugin bridges the two. It listens to the Host's unfiltered
 * `skills/change` invalidation and re-announces it as `plugin-manager/changed`,
 * the forwarded event `dsh-client-ui-skill` already clears its cache on. Bursts
 * are debounced because one save can invalidate the catalog repeatedly, and
 * Cordis dispatches events by name across the whole tree, so a plain
 * `ctx.emit` reaches the forwarding loop.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Coalesces a burst of invalidations into one broadcast. */
const DEBOUNCE_MS = 400

/** Diagnostic trail; a failed write never blocks the broadcast. */
function log(text) {
  try {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
    const dir = join(home, 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(
      join(dir, 'skill-catalog-refresh.log'),
      `${new Date().toISOString()} ${text}\n`,
      'utf8',
    )
  } catch {
    // Diagnostics only: never surface a logging failure to the catalog path.
  }
}

/** Register the bridge for one Host composition. */
export function apply(ctx) {
  let timer
  let pending = 0

  const flush = () => {
    timer = undefined
    const count = pending
    pending = 0
    try {
      // Payload must satisfy the owner package's `PluginChange` shape.
      ctx.emit('plugin-manager/changed', { reason: 'plugin' })
      log(`announced catalog change after ${count} skills/change event(s)`)
    } catch (error) {
      log(`announce failed: ${String(error)}`)
    }
  }

  const schedule = () => {
    pending += 1
    if (timer !== undefined) return
    timer = setTimeout(flush, DEBOUNCE_MS)
    if (typeof timer.unref === 'function') timer.unref()
  }

  ctx.on('skills/change', schedule)

  // A pending broadcast must not outlive the plugin.
  ctx.effect(() => () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  })
}
