#!/usr/bin/env bash

set -Eeuo pipefail

readonly SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly OUTPUT_DIR="${SOURCE_DIR}/dist"
readonly SCHEMA='schemas/org.gnome.shell.extensions.translate-clipboard-plus.gschema.xml'

for command_name in gnome-extensions glib-compile-schemas msgfmt msgmerge xgettext; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command_name" >&2
        printf 'Install the gettext package for the msg* tools (e.g. sudo dnf install gettext).\n' >&2
        exit 1
    fi
done

# The .mo catalogs shipped in locale/ are generated from the .po sources, and
# GNOME Shell loads only the .mo. Fail the release build rather than ship a
# catalog that is out of date or missing translations.
"${SOURCE_DIR}/locale/compile.sh" --check
glib-compile-schemas --strict --dry-run "${SOURCE_DIR}/schemas"
mkdir -p -- "$OUTPUT_DIR"

gnome-extensions pack --force \
    --out-dir="$OUTPUT_DIR" \
    --schema="$SCHEMA" \
    --extra-source=LICENSE \
    --extra-source=prefs.css \
    --extra-source=TcIndicator.js \
    --extra-source=TranslateWindow.js \
    --extra-source=google.js \
    --extra-source=languages.js \
    --extra-source=llm.js \
    --extra-source=tts.js \
    --extra-source=utils.js \
    --extra-source=vision.js \
    --extra-source=config \
    --extra-source=icons \
    --extra-source=locale \
    "$SOURCE_DIR"

printf 'Created upload package in %s\n' "$OUTPUT_DIR"
