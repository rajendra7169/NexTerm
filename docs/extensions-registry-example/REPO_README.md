# NexTerm Extensions Registry

Official extension registry for [NexTerm](https://github.com/rajendra7169/NexTerm) — a modern Windows terminal & code editor.

NexTerm's Extensions panel fetches this repo's `registry.json` to populate its marketplace. Each extension entry adds a feature, AI provider, theme, or language integration to NexTerm.

## How it works

NexTerm reads `registry.json` directly from this repo via the [jsDelivr CDN](https://www.jsdelivr.com/):

```
https://cdn.jsdelivr.net/gh/rajendra7169/nexterm-extensions@main/registry.json
```

No backend, no API, no signup — it's just a JSON file in a public GitHub repo. Push a commit → the registry updates within seconds.

## Available extensions

| Extension | Publisher | Description |
|---|---|---|
| **Claude** | Anthropic | Claude (Opus / Sonnet / Haiku) as a model in NexTerm's AI chat. Supports Claude Pro subscription auth (no API key) via the Claude Code CLI, or paid Anthropic API key. |

More extensions land here as they ship.

## Using these extensions

1. Open NexTerm
2. Click the **Extensions** icon in the activity bar (or `Ctrl+Shift+X`)
3. Browse the marketplace, click **Install** on the extension you want
4. Configure it (some extensions need an API key or one-time auth)

## Adding your own extension

PRs welcome. Each extension is an object in `registry.json`:

```json
{
  "id": "publisher.name",
  "name": "Display Name",
  "publisher": "Your Name",
  "version": "1.0.0",
  "description": "One-line description (~120 chars max).",
  "longDescription": "Optional multi-paragraph markdown shown on the detail page.",
  "icon": "https://cdn.jsdelivr.net/gh/rajendra7169/nexterm-extensions@main/icons/your-extension.svg",
  "screenshots": [],
  "tags": ["ai", "language", "theme"],
  "categories": ["AI"],
  "installs": 0,
  "rating": null,
  "added": "2026-05-15",
  "repository": "https://github.com/you/your-repo",
  "requires": { "nexterm": ">=0.4.0" },
  "features": ["chat-provider"]
}
```

### Important: NexTerm's current extension model

In v1, NexTerm does NOT load arbitrary code from this registry. Each "extension" listed here corresponds to a feature **built into NexTerm** that's gated behind an install flag. When a user clicks Install:

- NexTerm adds your extension `id` to `settings.installedExtensions`
- Built-in features check that array to know whether to show themselves

So adding an extension here is a **request to the NexTerm core team** to merge the feature into NexTerm itself. Once merged, listing it here exposes it to users via the Extensions panel.

A real loadable extension runtime (where third-party JS executes inside NexTerm) is planned for a future release.

### Submitting a new extension

1. Fork this repo
2. Add your icon to `icons/` (SVG preferred, 64×64 viewBox)
3. Add the entry to `registry.json` (alphabetized by `id`)
4. Open a PR with:
   - A short description of what the extension does
   - A link to the NexTerm core PR that implements the feature (if not already merged)

### Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique identifier `publisher.name`. NexTerm gates features by checking this. |
| `name` | yes | Display name (1-3 words). |
| `publisher` | yes | Organization or individual name. |
| `version` | yes | Semver. |
| `description` | yes | One-line, shows on cards (~120 chars). |
| `longDescription` | no | Markdown, shown on the detail page. Use `\n\n` for paragraphs. |
| `icon` | yes | Full URL to a 64×64 SVG or PNG, hosted in this repo's `icons/`. |
| `screenshots` | no | Array of image URLs (hosted in this repo or elsewhere). |
| `tags` | no | Free-form keywords for search. |
| `categories` | no | One of: `AI`, `Themes`, `Languages`, `Tools`, `Productivity`. |
| `installs` | no | Display-only counter (manually updated). |
| `rating` | no | 0-5 stars. |
| `added` | no | ISO date string. |
| `repository` | no | Link to the extension's source repo. |
| `requires.nexterm` | no | Minimum NexTerm version (semver range). |
| `features` | no | Capabilities the extension provides. Known values: `chat-provider`, `agent-mode`, `language-server`, `formatter`, `theme`, `icon-theme`. |

## Updating an existing extension

Just edit `registry.json` and push. jsDelivr revalidates `@main` within seconds. Users see the new version on their next Extensions panel refresh (or on app focus).

For long-term stability, you can pin a tag in NexTerm's settings: change the registry URL to `@v1.0.0` instead of `@main`.

## CDN URLs

- **Registry**: `https://cdn.jsdelivr.net/gh/rajendra7169/nexterm-extensions@main/registry.json`
- **Icons**: `https://cdn.jsdelivr.net/gh/rajendra7169/nexterm-extensions@main/icons/[name].svg`
- **Pinned version**: replace `@main` with `@v1.0.0` for an immutable snapshot

## License

MIT — extension entries are metadata, not code. Each linked extension's repository has its own license.
