# Changelog

## Unreleased

### Added

- A model availability check in the LLM settings page. A server icon at the end of
  the Model field sends one minimal chat request (`ping`) to the endpoint, model and
  API key currently in the fields, and reports the outcome on a `Model availability`
  row: a green check with the model name and the round-trip time, or a red cross with
  the reason plus a hint naming the thing to fix — `404 Not Found: The model \`nope\`
  does not exist - The model name was not found at this endpoint.`,
  `401 Unauthorized: invalid api key - The API key was rejected.`,
  `Failed to connect: Connection refused`. The check is informational: it writes no
  settings and gates no save, so a model that fails it is saved and used like any
  other. It follows each provider's request shape (OpenAI-compatible, Gemini
  `generateContent` via a new `probeBody()`, Ollama `/api/chat` via `createMessage`)
  and deliberately sends no `max_tokens` and no `temperature`, because the o1/gpt-5
  family rejects `max_tokens` outright and a probe body must not be the thing that
  fails. It honours the configured proxy, times out after 15 seconds, and drops
  callbacks that outlive their probe so a provider switch cannot show a stale result.
  Gemini builds its own URL and has no endpoint of its own, so an empty endpoint is
  accepted for providers that supply `getUrl()`.

### Fixed

- Translation ignored the endpoint you typed. `AiTranslator` was constructed with the
  saved provider settings, which include the endpoint the preferences page writes, but
  it never read them: `translate()` posted to `this._provider.endpoint`, the endpoint
  baked into the source. A custom endpoint was saved, shown in the UI, and then used
  for nothing. It now uses the saved endpoint and falls back to the provider's
  built-in one when the field is empty, which is also what makes the availability
  check meaningful: it probes the URL the translation will actually hit.

## 1.0.2 - 2026-11-05

### Fixed

- The Chinese interface was only partly translated, and part of it could not be
  translated at all. Three separate causes: the shipped `locale/zh_CN` catalog was
  the one imported with upstream v37 (`f004bc0`) and had never been refreshed, so
  39 of the strings the Plus edition added (screenshot OCR, the About page, the
  panel toolbar, the reverse-check section) had no entry and rendered in English;
  eleven strings were never wrapped in `gettext()`, so no catalog could ever cover
  them — the `Set Shortcut` dialog title, the `Translate the selected text` row,
  the API-key signup button, the `Translate selected` and `Settings` menu items,
  and the failure messages that `google.js`, `llm.js` and `vision.js` emit and the
  panel shows verbatim (`Failed to connect: `, `Invalid proxy protocol`, `404 (Page
  not found)`, `Vision endpoint and model are required.`, and six more); and the
  LLM provider list passed a variable to `gettext()`, which no extractor can see,
  so `Custom (compatible with OpenAI)` was dead code. The provider names are now
  marked with `N_()` so they reach the catalog, and it covers all 104 strings
  marked for translation.
- The repository shipped only binary `.mo` catalogs, with no `.po` source, so
  translations were not maintainable. Added `locale/*.po`, `locale/compile.sh`
  and `locale/update.sh`. `google.js`, `llm.js` and `vision.js` are loaded by both
  the shell and the preferences process, so they translate through
  `utils.gettext()`, a `GLib.dgettext()` wrapper over the domain in
  `config/constants.js`. `build.sh` now runs `locale/compile.sh --check`, so a
  release build fails when a `.mo` is stale or a Chinese translation is missing.
  `locale/ja` and `locale/ko` remain the empty stubs imported from upstream and
  fall back to English.
- The global shortcuts stopped summoning the translation panel on GNOME Shell
  51. `St.BoxLayout` no longer has a `vertical` property in GNOME 51; it takes
  `orientation` instead. The five `new St.BoxLayout({ vertical: true })` calls in
  `TranslateWindow.js` threw `No property vertical on StBoxLayout` from
  `_createWindow()`, so pressing the shortcut ran the handler but the panel was
  never created and nothing appeared. They now pass
  `orientation: Clutter.Orientation.VERTICAL`, which is what GNOME Shell's own
  interface uses (96 occurrences in Shell 51's UI code, zero `vertical: true`).
  Because the panel is built lazily, the extension enabled cleanly and the
  top-bar icon appeared, so the extension looked healthy while every invocation
  died before creating a window.
- Global shortcuts stopped working after an extension reload. Mutter keys its
  keybinding table by name and that table is global, so an entry can outlive the
  indicator that registered it. `_removeKeybindings()` was guarded by a
  per-instance `_keybindingsRegistered` flag, so a new instance skipped the
  removal, `add_keybinding()` then failed with "Trying to re-add keybinding",
  and `Main.wm.addKeybinding()` skips `allowKeybinding()` when the add fails.
  The keybinding stayed registered but allowed in no action mode, so the shortcut
  was inert until the shell restarted. `_setupKeybindings()` now removes the
  names unconditionally before adding, tracks registration per name, and checks
  the return value of `addKeybinding()` and logs when a shortcut is not active.

## 1.0.1 - 2026-11-05

### Fixed

- Added GNOME Shell 51 to `shell-version`. GNOME Shell 51 rejected the extension
  with an `OUT OF DATE` state, so it was enabled in gsettings but never loaded:
  no top-bar icon, no shortcut, and no JavaScript error in the journal. The
  compatibility check is `shell-version.some(v => v.startsWith(major))`, so the
  major version has to be listed explicitly; wildcards such as `*` and `5*` are
  not honoured. No JavaScript API changes were required for the version gate:
  every Shell, St, Meta, Clutter, PopupMenu and Soup API used by the extension
  is present in 51.
- Applying a new `shell-version` does not require a logout. `metadata.json` is
  cached at shell startup, so `gnome-extensions enable`/`disable` is not enough
  and the `ReloadExtension` D-Bus method is a no-op in 49+, but toggling
  `org.gnome.shell disable-extension-version-validation` makes the shell call
  `reloadExtension()`, which re-reads `metadata.json` from disk. `./deploy.sh
  --force-reload` does that and restores the key to `false`. A logout stays as a
  fallback. A logout is required only when the `version` field of
  `metadata.json` changes, because `_canLoad()` rejects a changed version; this
  project has no `version` field, so `shell-version` changes reload cleanly.
- `deploy.sh` excluded `.git/`, which does not match the `.git` *file* used by a
  git worktree, so the worktree pointer file was installed into the extension
  directory. It now excludes `.git` by name.
- `deploy.sh` used `rsync -ain` for the real deployment. `-n` is rsync's
  `--dry-run`, so files were reported as transferred without being written. The
  real deploy now uses `rsync -ai --delete`.

## 1.0.0 - 2026-08-27

First public release of Translate Clipboard Plus, based on Translate Clipboard version 37.

### Added

- Unique Plus identity and GSettings namespace for side-by-side installation with upstream.
- Movable right-side translation panel with persistent pinning and position.
- Independent copy and playback controls for original, translated, and checked text.
- Persistent automatic reverse-check mode that performs a second translation request.
- Persistent light mode with a complete high-contrast theme.
- Screenshot region selection from a configurable shortcut or the top-bar menu.
- In-memory screenshot capture and OpenAI-compatible multimodal OCR.
- Dedicated vision endpoint, model, and API-key settings.
- OCR text chaining into the selected translation engine.
- Loading, error, and reverse-check result states.
- Safe deployment and reproducible extensions.gnome.org packaging scripts.

### Changed

- Results open as a right-side panel rather than following the mouse pointer.
- The toolbar copy action was replaced by copy actions attached to each result section.
- The reverse-check action is now a persistent toggle rather than a one-shot button.
- Playback icons use theme-aware symbolic icons.
- The default custom LLM endpoint supports a local OpenAI-compatible translation service.

### Privacy

- Clipboard monitoring remains disabled by default.
- Screenshot captures are held in memory and are not written to temporary image files.
- The extension description and documentation disclose clipboard, screenshot, translation, and speech-service data flows.
