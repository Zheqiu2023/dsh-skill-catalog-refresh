# Skill catalog refresh

Keeps the slash skill menu in an open conversation in sync with the skills installed on disk.

## The problem it solves

The skill catalog behind the `/` menu is fetched once per client session and cached by
`@deepseek-ai/dsh-client-ui-skill`. Installing or removing a `SKILL.md` on disk does not reach any open
window: the Host's skill registry announces an unfiltered `skills/change` invalidation, but that event
is not in the forwarded-event allowlist of `@deepseek-ai/dsh-api-remotes`, so clients never receive it.
The cached catalog is cleared only by `agent-preset/selected`, `plugin-manager/changed`, or
`connection/reset` — a page reload inside the Desktop shell often does not produce the last one.

The visible symptom: an installed skill works immediately for the agent, but `/` keeps listing the
skills that existed when the conversation started. Starting a new conversation fixes it, and deleting
one skill file does not appear at all.

## What it does

It bridges the two events. The Host already tells plugins that the catalog may have changed; this
plugin re-announces that as the forwarded event the Web client already clears its cache on.

```
skills/change  (Host, emitted by @deepseek-ai/dsh-skill on every invalidation)
      │         debounced 400 ms
      ▼
plugin-manager/changed  (forwarded event, @deepseek-ai/dsh-api-remotes allowlist)
      ▼
dsh-client-ui-skill  clearAll()  →  next `/` keystroke refetches the catalog
```

Because it listens to the registry's invalidation rather than to directories, it covers every skill
provider and every scanned root — project `.dsh/skills`, project `.agents/skills`, the user DSH root,
the shared agents root, custom directories, and any other provider registered on the Host.

`plugin-manager/changed` is reused deliberately: it is the only forwarded event whose documented
meaning is "a catalog-wide invalidation happened, re-read it". Its payload `{ reason: 'plugin' }` is the
shape the owning package declares. Other listeners treat it as a refresh hint; none of them reads
skill state from it.

## Behavior

| Situation | Result |
|---|---|
| A skill directory, `SKILL.md`, or its frontmatter appears, changes, or is deleted | One broadcast after the burst settles |
| Several invalidations within 400 ms (one save often triggers more than one) | Coalesced into a single broadcast |
| The event fires while no window is connected | Nothing to update; the next window to fetch a catalog reads the current state |
| Agent-side tool use, model context, session logs | Unaffected — this plugin adds no tools, context, or commands |

Nothing is written to the profile, and no configuration is required.

## Diagnostic log

Each broadcast appends one line to `<DSH_HOME>/logs/skill-catalog-refresh.log`:

```
2026-11-16T15:40:02.113Z announced catalog change after 2 skills/change event(s)
```

The line proves the Host half ran; whether a window then repainted the menu is observed in the window
itself. A failed log write is ignored, so a read-only home directory cannot block refreshes.

## Limitations

- **Windows already open receive it; closed ones do not.** The broadcast updates connected clients only.
  A window that connects later reads the current catalog anyway.
- **Nothing to refresh without a window.** With no Web client connected the broadcast is a no-op —
  correct, since there is no cached catalog to drop.
- **It does not fix a stale window it cannot reach.** If a client misses the event (for example because
  its connection was suspended), the menu stays stale until that window reconnects, reloads, or starts a
  new conversation.
- **Clients that do not listen see nothing.** The behavior above depends on
  `dsh-client-ui-skill` clearing its cache on `plugin-manager/changed`; a future version of that
  package could change its invalidation contract, and this plugin would need updating with it.
