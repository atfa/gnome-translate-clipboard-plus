#!/usr/bin/env bash
#
# Compile the human-readable .po catalogs into the binary .mo files that GNOME
# Shell's gettext actually loads. The .po files are the source of truth; the .mo
# files in this repository are generated artifacts and must never be edited by
# hand.
#
# Usage:
#   ./locale/compile.sh              Compile every catalog.
#   ./locale/compile.sh zh_CN        Compile one catalog.
#   ./locale/compile.sh --check      Compile nothing; fail if any catalog is
#                                    missing a translation for a string that
#                                    the sources mark for translation, or if a
#                                    checked-in .mo is out of date.
#
set -Eeuo pipefail

readonly LOCALE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SOURCE_DIR="$(dirname -- "${LOCALE_DIR}")"
readonly DOMAIN='TranslateClipboard'

# Languages that must carry a translation for every user-visible string. The
# remaining catalogs are shipped as partial stubs: upstream imported them empty
# (locale/ja and locale/ko have 0 translated messages) and nobody has filled
# them in, so their untranslated count is reported but not treated as a failure.
readonly COMPLETE_LANGUAGES=(zh_CN)

check_only=false
languages=()

for argument in "$@"; do
    case "$argument" in
        --check)
            check_only=true
            ;;
        -h|--help)
            sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            languages+=("$argument")
            ;;
    esac
done

for command_name in msgfmt msgcat msgmerge xgettext; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command_name" >&2
        printf 'Install the gettext package (e.g. sudo dnf install gettext).\n' >&2
        exit 1
    fi
done

if ((${#languages[@]} == 0)); then
    for po in "${LOCALE_DIR}"/*/LC_MESSAGES/"${DOMAIN}".po; do
        [[ -e "$po" ]] || continue
        languages+=("$(basename "$(dirname "$(dirname "$po")")")")
    done
fi

if ((${#languages[@]} == 0)); then
    printf 'No .po catalogs found in %s\n' "$LOCALE_DIR" >&2
    exit 1
fi

# The template is the union of everything xgettext finds in the sources and the
# strings that are only translated at runtime (see locale/dynamic.pot).
template="$(mktemp)"
trap 'rm -f -- "$template"' EXIT
xgettext --language=JavaScript --keyword=_ --keyword=N_ --from-code=UTF-8 \
    --package-name='Translate Clipboard Plus' \
    --msgid-bugs-address='https://github.com/atfa/gnome-translate-clipboard-plus/issues' \
    --output="$template" \
    --directory="$SOURCE_DIR" \
    --no-location \
    extension.js prefs.js TcIndicator.js TranslateWindow.js \
    google.js llm.js tts.js vision.js utils.js languages.js \
    config/constants.js
# xgettext has no --charset option, so fix the placeholder it writes.
sed -i 's/charset=CHARSET/charset=UTF-8/' "$template"
msgcat --use-first "$template" "${LOCALE_DIR}/dynamic.pot" -o "${template}.full"
mv -- "${template}.full" "$template"

status=0
for language in "${languages[@]}"; do
    po="${LOCALE_DIR}/${language}/LC_MESSAGES/${DOMAIN}.po"
    mo="${LOCALE_DIR}/${language}/LC_MESSAGES/${DOMAIN}.mo"

    if [[ ! -f "$po" ]]; then
        printf 'Missing catalog: %s\n' "$po" >&2
        status=1
        continue
    fi

    merged="$(mktemp)"
    msgcat --use-first "$template" "$po" -o "$merged"

    untranslated="$(LC_ALL=C msgfmt --statistics -o /dev/null "$merged" 2>&1 \
        | grep -oE '[0-9]+ untranslated' | grep -oE '[0-9]+' || true)"
    untranslated="${untranslated:-0}"

    required=false
    for complete in "${COMPLETE_LANGUAGES[@]}"; do
        [[ "$complete" == "$language" ]] && required=true
    done

    if "$check_only"; then
        if ((untranslated > 0)); then
            if "$required"; then
                printf '%s: %s string(s) without a translation:\n' \
                    "$language" "$untranslated"
                LC_ALL=C msgattrib --untranslated "$merged" \
                    | msgunfmt --no-location 2>/dev/null | grep '^msgid ' \
                    | grep -v '^msgid ""$' | sed 's/^/  /'
                status=1
            else
                printf '%s: partial catalog, %s string(s) untranslated\n' \
                    "$language" "$untranslated"
            fi
        fi
        if [[ ! -f "$mo" ]] || ! cmp -s <(msgfmt -o - "$po") "$mo"; then
            printf '%s: %s is out of date, run ./locale/compile.sh %s\n' \
                "$language" "$mo" "$language" >&2
            status=1
        fi
        printf '%s: OK (%s untranslated)\n' "$language" "$untranslated"
    else
        msgfmt --check --output="$mo" "$po"
        printf 'Compiled %s -> %s\n' "$po" "$mo"
        if ((untranslated > 0)); then
            printf '%s: %s string(s) still untranslated\n' "$language" "$untranslated"
        fi
    fi
    rm -f -- "$merged"
done

exit "$status"
