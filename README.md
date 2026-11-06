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
- Check whether a configured LLM model is reachable with one button in the LLM settings page.

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
- GNOME Shell only loads an extension whose `metadata.json` lists the running
  shell's major version. The check is
  `shell-version.some(v => v.startsWith(major))`, so wildcards such as `"*"` and
  `"5*"` do not work: every supported major version must be listed explicitly.
  After a GNOME major upgrade, add the new major version to `shell-version`,
  otherwise the extension is reported as `OUT OF DATE` and is never loaded.
- Applying a new `shell-version` usually does not need a logout. `gnome-extensions
  enable`/`disable` reuses the cached metadata and is not enough, and the
  `ReloadExtension` D-Bus method is a no-op in 49+, but toggling
  `org.gnome.shell disable-extension-version-validation` makes the shell call
  `reloadExtension()`, which re-reads `metadata.json` from disk. `./deploy.sh
  --force-reload` does this for you and restores the key to `false`. Logging out
  and back in is a fallback that always works.
- A logout *is* required when the `version` field of `metadata.json` changes:
  `unloadExtension()` records the old value and `_canLoad()` then refuses the new
  one, logging "A different version was loaded previously. You need to log out
  for changes to take effect." This project's `metadata.json` has no `version`
  field, so `shell-version` changes reload cleanly.
- Toggling `disable-extension-version-validation` reloads every extension and
  permanently drops any extension that is out of date from `enabled-extensions`.
  Do not leave the key set to `true` as a permanent workaround.
- Changes to the extension's own JavaScript **do** need a logout on Wayland:
  GNOME Shell caches extension modules, so `deploy.sh` prints a reminder.

### How the version gate works

GNOME Shell 51 decides compatibility with:

```js
const [major] = Config.PACKAGE_VERSION.split('.');
return !extension.metadata['shell-version'].some(v => v.startsWith(major));
```

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

## Model availability check

The LLM settings page has a server icon at the end of the Model field. It sends one
minimal chat request (`ping`) to the endpoint, model, and API key that are currently
in the fields, and reports the result on the `Model availability` row below: a green
check with the model name and the round-trip time, or a red cross with the reason and
a hint naming the thing to fix:

```text
Model is available: qwen3vl-it:4b (87 ms)
Model is not available: 404 Not Found: The model `nope` does not exist - The model name was not found at this endpoint.
Model is not available: 401 Unauthorized: invalid api key - The API key was rejected.
Model is not available: Failed to connect: Connection refused
```

The check is informational only. It never writes settings and never blocks saving: a
model that fails the check is saved and used exactly like one that passes. The row is
the only place the result appears, and switching providers clears it.

Requests follow the provider's own request shape, so OpenAI-compatible endpoints,
Gemini, and Ollama are probed with the body each of them expects, and none of them
carries `max_tokens` or `temperature`, which some current models reject outright. The
configured network proxy is used when set, and the request times out after 15 seconds.
Gemini builds its own URL, so an empty endpoint is normal there and is not rejected.

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

## Interface language

The user interface is translated with gettext. The catalog domain is
`TranslateClipboard` (the `gettext-domain` field of `metadata.json`), and GNOME
Shell loads `locale/<language>/LC_MESSAGES/TranslateClipboard.mo` from the
installed extension directory, so the interface follows the desktop language.

| Language | Catalog | Coverage |
| --- | --- | --- |
| Chinese (China) | `locale/zh_CN/` | complete (104 strings) |
| Japanese | `locale/ja/` | empty stub, falls back to English |
| Korean | `locale/ko/` | empty stub, falls back to English |

The `.po` files are the source of truth; the `.mo` files are generated and must
not be edited by hand. GNOME Shell reads only the `.mo`, so a `.po` edit has no
effect until it is compiled:

```bash
./locale/compile.sh            # regenerate every .mo from its .po
./locale/compile.sh --check    # fail if a catalog is incomplete or stale
./locale/update.sh             # pull new source strings into the .po files
```

`locale/compile.sh --check` is run by `build.sh`, so a release build fails if a
`.mo` is out of date or a string marked for translation has no Chinese text.

Provider display names in `llm.js` are translated at display time from a
variable, which `xgettext` cannot see. They are wrapped in the `N_()` no-op
marker so the extractor picks them up (`--keyword=N_` is set in both scripts);
adding a provider without a `N_()` wrapper leaves its name untranslated and is
the one way a string can escape the coverage check.

`google.js`, `llm.js` and `vision.js` are loaded by both the shell process and
the preferences process, so they translate through `utils.gettext()`, which
calls `GLib.dgettext()` with the domain named in `config/constants.js`. The
shell-only `gettext` helper from
`resource:///org/gnome/shell/extensions/extension.js` is not usable there.

The `summary` and `description` in `schemas/*.gschema.xml` are translated by the
system `gnome-shell-extensions` domain, not by this extension's catalog, so
they are not covered by the files above.

## Build an extensions.gnome.org ZIP

```bash
./build.sh
```

Requires the `gettext` tools (`xgettext`, `msgmerge`, `msgfmt`) in addition to
`gnome-extensions` and `glib-compile-schemas`.

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
