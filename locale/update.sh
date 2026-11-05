#!/usr/bin/env bash
#
# Refresh the .po catalogs from the strings marked for translation in the
# JavaScript sources, keeping every translation that is still usable. New
# strings are merged in empty, so `./locale/compile.sh --check` lists exactly
# what a translator has to fill in.
#
# Usage:
#   ./locale/update.sh              Refresh every catalog, then compile it.
#   ./locale/update.sh zh_CN        Refresh one catalog, then compile it.
#
# Run this after adding, renaming, or removing a user-visible string, then
# translate the entries compile.sh reports and commit both the .po and the .mo.
#
set -Eeuo pipefail

readonly LOCALE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if ! command -v msgmerge >/dev/null 2>&1; then
    printf 'Required command not found: msgmerge\n' >&2
    exit 1
fi

template="$(mktemp)"
trap 'rm -f -- "$template"' EXIT

# Rebuild the template the same way compile.sh does, so both scripts agree on
# what "every user-visible string" means.
xgettext --language=JavaScript --keyword=_ --keyword=N_ --from-code=UTF-8 \
    --package-name='Translate Clipboard Plus' \
    --msgid-bugs-address='https://github.com/atfa/gnome-translate-clipboard-plus/issues' \
    --output="$template" \
    --directory="$(dirname -- "${LOCALE_DIR}")" \
    extension.js prefs.js TcIndicator.js TranslateWindow.js \
    google.js llm.js tts.js vision.js utils.js languages.js \
    config/constants.js
# xgettext has no --charset option, so fix the placeholder it writes.
sed -i 's/charset=CHARSET/charset=UTF-8/' "$template"
msgcat --use-first "$template" "${LOCALE_DIR}/dynamic.pot" -o "${template}.full"
mv -- "${template}.full" "$template"

languages=("$@")
if ((${#languages[@]} == 0)); then
    for po in "${LOCALE_DIR}"/*/LC_MESSAGES/TranslateClipboard.po; do
        [[ -e "$po" ]] || continue
        languages+=("$(basename "$(dirname "$(dirname "$po")")")")
    done
fi

for language in "${languages[@]}"; do
    po="${LOCALE_DIR}/${language}/LC_MESSAGES/TranslateClipboard.po"
    if [[ ! -f "$po" ]]; then
        printf 'Skipping %s: %s does not exist\n' "$language" "$po" >&2
        continue
    fi
    # --no-fuzzy-workarounds keeps msgmerge from silently reusing near matches;
    # a translator must confirm every new string.
    msgmerge --update --backup=none --no-fuzzy-matching --quiet "$po" "$template"
    printf 'Refreshed %s\n' "$po"
done

"${LOCALE_DIR}/compile.sh" ${languages[@]+"${languages[@]}"}
