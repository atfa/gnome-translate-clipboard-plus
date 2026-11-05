# Changelog

## 1.0.1 - Unreleased

### Fixed

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
- Added GNOME Shell 51 to `shell-version`. On GNOME Shell 51 the extension was
  reported as `OUT OF DATE` and was never loaded, because GNOME Shell refuses to
  load an extension whose `metadata.json` does not list the running shell's
  major version. No JavaScript API changes were required: every Shell, St, Meta,
  Clutter, PopupMenu and Soup API used by the extension is unchanged in 51.
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
