# NexTerm Extensions Registry

This is the registry file NexTerm fetches to populate its **Extensions** panel.

## How to host

1. **Create a new public GitHub repo** named `nexterm-extensions` under your account (`Rajendra-pandey`).
2. **Copy these two files** to the repo root:
   - `registry.json`
   - `icons/claude.svg` (and any other extension icons)
3. **Push to main.**

That's it. jsDelivr automatically serves your repo at:

```
https://cdn.jsdelivr.net/gh/Rajendra-pandey/nexterm-extensions@main/registry.json
```

NexTerm fetches that URL on the Extensions panel open (the URL is baked into `settings.extensionsRegistryUrl`).

## Adding a new extension

Edit `registry.json` → add an entry to `extensions[]`. Each entry:

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique identifier, e.g. `publisher.name`. NexTerm gates features by checking `installedExtensions.includes(id)`. |
| `name` | yes | Display name in the panel. |
| `publisher` | yes | "Anthropic", "Google", etc. |
| `version` | yes | Semver string. |
| `description` | yes | One-line, shows on the card (~120 chars). |
| `longDescription` | no | Full markdown shown on the detail page. |
| `icon` | yes | jsDelivr URL to an SVG/PNG. |
| `screenshots` | no | Array of image URLs. |
| `tags` | no | Searchable keywords. |
| `categories` | no | "AI", "Themes", "Languages", etc. |
| `installs` | no | Display-only counter. |
| `rating` | no | 0-5 stars. |
| `added` | no | ISO date string. |
| `repository` | no | Link shown on the detail page. |
| `requires.nexterm` | no | Min NexTerm version (semver range). |
| `features` | no | Capability tags read by NexTerm to know what the extension provides. |

## Updating the registry

Just edit `registry.json` and `git push`. jsDelivr cache invalidates within seconds for `@main`.

For long-term stability, you can pin a tag: `@v1.0.0` instead of `@main`.
