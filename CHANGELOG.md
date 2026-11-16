# Changelog

## 1.0.1

- Fix the row inserted by `cordis.patch.yml`: it named `@local/skill-catalog-refresh`, the development
  package name, so every installation failed to activate with `ERR_MODULE_NOT_FOUND`. The row now names
  the published package, `dsh-skill-catalog-refresh`.
- Nothing else changed: the plugin behaviour is identical to 1.0.0.

## 1.0.0

- First release. Bridges the Host's `skills/change` invalidation to the forwarded
  `plugin-manager/changed` event so an open session's slash skill menu picks up installed skills
  without starting a new conversation.
