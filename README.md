# Translate Clipboard Plus

Translate Clipboard Plus is a GNOME Shell extension for fast text translation from the top bar. It can translate selected or clipboard text, recognize text in a selected screenshot area, run an automatic reverse-translation check, read results aloud, and display results in a movable sidebar.

This project is a GPL-3.0 fork of [Translate Clipboard](https://github.com/lsnow/translate-clipboard) by lsnow. The Plus edition has a unique extension identity and settings namespace, so it does not overwrite the original extension.

## Highlights

- Translate selected text with a configurable global shortcut.
- Optional clipboard monitoring, disabled by default.
- Select a screen area and recognize its text with a configurable OpenAI-compatible vision model.
- Send recognized text to the currently selected Google or LLM translation engine.
- Copy the original text, translation, or reverse-check result independently.
- Read each result aloud through Microsoft Edge online speech synthesis and local GStreamer playback.
- Enable automatic reverse checks: one primary request followed by one reverse-translation request.
- Pin and drag the result sidebar.
- Switch between a high-contrast dark panel and a persistent light theme.
- Configure primary and secondary target languages.

## What the Plus edition adds

Compared with upstream version 37, this fork adds:

1. A fixed right-side result panel that can be dragged and pinned.
2. Per-section copy and playback controls for the original, translation, and check result.
3. A persistent automatic reverse-check toggle.
4. A persistent, complete light theme.
5. Screenshot OCR from a global shortcut or the top-bar menu.
6. In-memory PNG capture without temporary screenshot files.
7. A separately configurable OpenAI-compatible vision endpoint and model.
8. OCR-to-translation chaining: the vision model extracts text, then the selected translation engine translates it.
9. A safe local deployment script and a reproducible upload-package script.

See [CHANGELOG.md](CHANGELOG.md) for the release summary.

## Compatibility

- GNOME Shell 49, 50 and 51
- Wayland is supported.

### How the version gate works

GNOME Shell 51 decides compatibility with:

```js
const [major] = Config.PACKAGE_VERSION.split('.');
return !extension.metadata['shell-version'].some(v => v.startsWith(major));
```

So every supported major version must be listed explicitly in `metadata.json`.
Wildcards are **not** honoured: `"*"` and `"5*"` both fail the `startsWith(major)`
check and leave the extension `OUT OF DATE`. When GNOME Shell 52 is released,
add `"52"` to `shell-version`, verify the extension loads, then release.

If the extension shows as `OUT OF DATE`, it is never loaded at all — there is no
JavaScript error in the journal. Confirm with:

```bash
gnome-extensions info translate-clipboard-plus@atfa.github.io
```

For a one-off test without editing `metadata.json`, you can disable the gate
(this is what "unsafe mode" does):

```bash
gsettings set org.gnome.shell disable-extension-version-validation true
```

Beware that toggling that key makes GNOME Shell drop every `OUT OF DATE`
extension from `org.gnome.shell enabled-extensions`, permanently, so it is not
a good long-term workaround.

### Applying a metadata change without logging out

GNOME Shell parses `metadata.json` in `createExtensionObject()`, which is only
reached from `reloadExtension()`. `gnome-extensions disable/enable` goes through
`_onEnabledExtensionsChanged`, which reuses the cached metadata object, and the
`ReloadExtension` D-Bus method is a deprecated no-op in GNOME 51. So a plain
disable/enable will not apply a `shell-version` change.

`./deploy.sh --force-reload` forces the reload by toggling
`disable-extension-version-validation`, which makes
`_onVersionValidationChanged()` call `reloadExtension()` for every extension.

One boundary matters: `unloadExtension()` records `extension.metadata.version`,
and `_canLoad()` then refuses to reload when that value changes, logging
"A different version was loaded previously. You need to log out for changes to
take effect." This extension has no `version` field, so the comparison is
`undefined === undefined` and the reload succeeds. In other words: changing
`shell-version` needs no logout, but adding and bumping a `version` field does.
- The extension uses GNOME Shell's built-in screenshot API; no `gnome-screenshot`, `grim`, or `slurp` package is required.

## Installation

### GNOME Extensions / Extension Manager

After the first release is approved on extensions.gnome.org, search for **Translate Clipboard Plus** in Extension Manager and select **Install**.

### Install a release ZIP manually

Download the release ZIP, then run:

```bash
gnome-extensions install --force translate-clipboard-plus@atfa.github.io.shell-extension.zip
```

Log out and back in once, then enable **Translate Clipboard Plus** in Extension Manager.

### Install from source

```bash
git clone https://github.com/atfa/gnome-translate-clipboard-plus.git
cd gnome-translate-clipboard-plus
./deploy.sh
```

On Wayland, log out and back in after JavaScript changes because GNOME Shell caches extension modules.

## Screenshot translation

The default screenshot shortcut is `Super+Shift+D`. It can be changed in the extension preferences. Screenshot translation is also available from the top-bar icon menu.

The default vision configuration targets a local OpenAI-compatible Qwen3-VL service:

```yaml
endpoint: http://127.0.0.1:52625/v1
model: qwen3vl-it:4b
api_key: dummy
```

The request uses the OpenAI multimodal `chat/completions` format with an in-memory PNG data URL. The vision model only extracts text; the result is then sent to the translation engine selected in the extension settings.

## Automatic reverse checks

Enable the double-arrow toolbar toggle to check every translation automatically. With automatic source language, a primary target, and a secondary target, the flow is:

```text
original text -> primary language
primary translation -> secondary language
```

If the translation engine reports the detected source language, the reverse request prefers that detected language. The global language settings are never swapped or modified.

## Text-to-speech

Playback is not offline synthesis. The extension requests MP3 audio from Microsoft Edge's online speech service, then decodes and plays it locally with GStreamer through the system audio output. The selected voice can be changed in preferences.

## Privacy

Clipboard monitoring is disabled by default. When enabled, the extension reads primary-selection text and may send it to the configured translation provider. A manually requested screenshot is sent to the configured vision endpoint. Text-to-speech sends the selected text to Microsoft's online speech service.

For a complete data-flow description, see [PRIVACY.md](PRIVACY.md).

## Build an extensions.gnome.org ZIP

```bash
./build.sh
```

The upload-ready archive is written to `dist/`. It contains readable source code and the source GSettings schema, but not the locally generated `gschemas.compiled` file.

## Development

```bash
./deploy.sh --dry-run
./deploy.sh
```

The extension UUID is `translate-clipboard-plus@atfa.github.io`, and its schema ID is `org.gnome.shell.extensions.translate-clipboard-plus`.

## License and credits

Copyright remains with the respective contributors. This project is distributed under the [GNU General Public License v3.0](LICENSE).

- Original extension: [lsnow/translate-clipboard](https://github.com/lsnow/translate-clipboard)
- Plus edition maintainer: [atfa](https://github.com/atfa)
