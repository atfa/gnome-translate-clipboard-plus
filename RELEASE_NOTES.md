# Public release notes

## Suggested extensions.gnome.org listing

**Name:** Translate Clipboard Plus

**Description:**

Translate selected or clipboard text from the GNOME top bar. Translate Clipboard Plus adds screenshot OCR, automatic reverse-translation checks, per-result copy and playback controls, a movable and pinnable sidebar, and persistent light/dark themes.

Clipboard monitoring is disabled by default. When enabled, selected text may be sent to the translation provider configured by the user. Screenshot translation sends the manually selected screen area to the configured vision endpoint. Text-to-speech uses Microsoft Edge's online speech service.

This GPL-3.0 project is a fork of Translate Clipboard by lsnow.

## Version 1.0.0 reviewer summary

- Forked from upstream extension version 37 with a unique name, UUID, and GSettings schema.
- Declares clipboard access in both metadata and public documentation.
- Keeps clipboard monitoring disabled by default.
- Adds user-initiated screenshot selection and in-memory PNG capture.
- Sends screenshots only to the user-configured OpenAI-compatible vision endpoint.
- Adds persistent automatic reverse translation and light mode.
- Adds independent copy and speech controls to each result section.
- Cleans up keybindings, signals, timers, network sessions, and actors when disabled.
- Includes only readable GJS source, required icons, translations, styles, and the source schema in the upload ZIP.
- Does not bundle executables, minified code, telemetry, analytics, or `gschemas.compiled`.

## Upload procedure

Build and inspect the archive:

```bash
./build.sh
unzip -l dist/translate-clipboard-plus@atfa.github.io.shell-extension.zip
```

Upload it with GNOME Shell 49+ tooling:

```bash
gnome-extensions upload --accept-tos \
  dist/translate-clipboard-plus@atfa.github.io.shell-extension.zip
```

The upload command asks for an extensions.gnome.org account. Publication occurs only after GNOME reviewer approval.
