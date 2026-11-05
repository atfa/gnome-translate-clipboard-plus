# Changelog

## 1.0.2 - 2026-11-05

### Fixed

- Replaced every `vertical: true` on `St.BoxLayout` with
  `orientation: Clutter.Orientation.VERTICAL`. GNOME Shell 51 removed the
  `vertical` property from `St.BoxLayout`, and GJS throws
  `No property vertical on StBoxLayout` for unknown constructor properties.
  The panel is built lazily, so the extension enabled cleanly and the top-bar
  icon appeared, but pressing the shortcut ran the handler and then threw before
  any window was created: the shortcut looked dead. Shell 51's own UI code uses
  `orientation: Clutter.Orientation.VERTICAL` (96 occurrences, zero `vertical: true`).
- `deploy.sh` now restarts the extension after deploying, and warns that GNOME
  Shell caches extension JavaScript, so `.js` changes need a shell restart
  (log out and back in on Wayland).

## 1.0.1 - 2026-11-05

### Fixed

- Added GNOME Shell 51 to `shell-version`. GNOME Shell 51 rejected the extension
  with an `OUT OF DATE` state, so it was enabled in gsettings but never loaded:
  no top-bar icon, no shortcut, and no JavaScript error in the journal. The
  compatibility check is `shell-version.some(v => v.startsWith(major))`, so the
  major version has to be listed explicitly.

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
