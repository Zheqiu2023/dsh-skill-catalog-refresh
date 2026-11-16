# dsh-skill-catalog-refresh

A small DeepSeek Harness plugin that keeps the slash skill menu of **open** sessions in sync with the
skills installed on disk.

## The problem

The skill catalog behind the `/` menu is fetched once per client session and cached by
`@deepseek-ai/dsh-client-ui-skill`. Installing, changing, or deleting a `SKILL.md` does not reach a
window that is already open:

- The Host's skill registry does announce `skills/change` on every invalidation.
- That event is **not** in the forwarded-event allowlist of `@deepseek-ai/dsh-api-remotes`, so no client
  ever receives it.
- The cached catalog is cleared only by `agent-preset/selected`, `plugin-manager/changed`, or
  `connection/reset` — and a page reload inside the Desktop shell often produces none of them.

Visible symptom: a newly installed skill works immediately for the agent, but `/` keeps listing the
skills that existed when the conversation started. Deleting a skill file does not disappear at all.

## What it does

It bridges the two events, in about ninety lines of Host code and no client code:

```
skills/change  (Host, emitted by @deepseek-ai/dsh-skill on every invalidation)
      │        debounced 400 ms
      ▼
plugin-manager/changed  (forwarded event, @deepseek-ai/dsh-api-remotes allowlist)
      ▼
dsh-client-ui-skill  clearAll()  →  the next `/` keystroke refetches the catalog
```

Listening to the registry's invalidation rather than to directories means it covers every skill
provider and every scanned root: project `.dsh/skills`, project `.agents/skills`, the user DSH root,
the shared agents root, custom directories, and any other provider registered on the Host.

## Install

With the DSH CLI:

```sh
dsh plugin --profile <profile> add github:Zheqiu2023/dsh-skill-catalog-refresh
```

Or with the `plugin_manager` agent tool, passing the repository spec:

```
install_bundle { target: "github:Zheqiu2023/dsh-skill-catalog-refresh" }
```

Or from a local checkout: point **Plugins → Add plugin** at the package directory.

No configuration, no restart after activation, no commands, no tools. The plugin adds nothing to the
model context.

## Behavior

| Situation | Result |
|---|---|
| A skill directory, `SKILL.md`, or its frontmatter appears, changes, or is deleted | One broadcast after the burst settles |
| Several invalidations within 400 ms (one save often triggers more than one) | Coalesced into a single broadcast |
| The event fires while no window is connected | Nothing to update; a window that connects later reads the current catalog |
| Agent tools, model context, session log | Unaffected |

## Diagnostic log

Each broadcast appends one line to `<DSH_HOME>/logs/skill-catalog-refresh.log`:

```
2026-11-16T15:34:47.144Z announced catalog change after 2 skills/change event(s)
```

The line proves the Host half ran. Whether a window then repainted its menu is observed in the window.
A failed log write is ignored, so a read-only home directory cannot block refreshes.

## Limitations

- **Only connected windows are updated.** A window that misses the event stays stale until it
  reconnects, reloads, or starts a new conversation.
- **It depends on the current invalidation contract.** The bridge assumes
  `dsh-client-ui-skill` clears its cache on `plugin-manager/changed`. If a future DSH release forwards
  `skills/change` itself — the proper fix — this plugin becomes unnecessary; if the client's
  invalidation contract changes, the plugin needs updating with it.
- **`plugin-manager/changed` is reused deliberately.** It is the only forwarded event whose documented
  meaning is "a catalog-wide invalidation happened, re-read it". Its payload `{ reason: 'plugin' }` is
  the declared `PluginChange` shape, and its other listeners treat it purely as a refresh hint.

## Verified

Host side verified on DSH `0.2.2-rc.3` under Windows: creating and deleting a skill under
`~/.agents/skills` each produced exactly one broadcast (two `skills/change` events coalesced per
operation), confirmed in the log above.

Client side is **not** claimed as verified here. It relies on the documented contract that
`dsh-client-ui-skill` clears its cached catalog on `plugin-manager/changed`; the same event produced by an
ordinary plugin-manager operation was observed to refresh the menu, but a controlled test dedicated to
this plugin's own broadcast has not been run. Please report what you see.

## License

MIT
