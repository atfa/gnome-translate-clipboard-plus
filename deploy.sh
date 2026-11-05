#!/usr/bin/env bash

set -Eeuo pipefail

readonly UUID='translate-clipboard-plus@atfa.github.io'
readonly SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly EXTENSIONS_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/gnome-shell/extensions"
readonly TARGET_DIR="${EXTENSIONS_DIR}/${UUID}"

dry_run=false
reload_extension=true

usage() {
    cat <<'EOF'
Usage: ./deploy.sh [--dry-run] [--no-reload] [--force-reload]

Deploy this working tree to the per-user GNOME Shell extension directory.

Options:
  --dry-run       Show which files would change without deploying or reloading.
  --no-reload     Deploy files without disabling and re-enabling the extension.
  --force-reload  Also force GNOME Shell to re-read metadata.json without
                  logging out. See the note printed after a metadata change.
  -h, --help      Show this help.
EOF
}

force_reload=false

while (($# > 0)); do
    case "$1" in
        --dry-run)
            dry_run=true
            ;;
        --no-reload)
            reload_extension=false
            ;;
        --force-reload)
            force_reload=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

for command_name in rsync glib-compile-schemas; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command_name" >&2
        exit 1
    fi
done

if ! grep -Eq '"uuid"[[:space:]]*:[[:space:]]*"translate-clipboard-plus@atfa\.github\.io"' \
    "${SOURCE_DIR}/metadata.json"; then
    printf 'Refusing to deploy: metadata.json does not contain the expected UUID.\n' >&2
    exit 1
fi

if [[ -L "$TARGET_DIR" ]]; then
    printf 'Refusing to deploy through a symbolic-link target: %s\n' "$TARGET_DIR" >&2
    exit 1
fi

stage_dir="$(mktemp -d /tmp/translate-clipboard-deploy.XXXXXX)"
cleanup() {
    if [[ -n "${stage_dir:-}" && -d "$stage_dir" && "$stage_dir" == /tmp/translate-clipboard-deploy.* ]]; then
        rm -rf -- "$stage_dir"
    fi
}
trap cleanup EXIT

# Assemble only runtime content. Development metadata and this script stay in
# the working tree and are not installed into GNOME Shell's extension folder.
rsync -a \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='deploy.sh' \
    --exclude='build.sh' \
    --exclude='README.md' \
    --exclude='CHANGELOG.md' \
    --exclude='CONTRIBUTING.md' \
    --exclude='PRIVACY.md' \
    --exclude='RELEASE_NOTES.md' \
    --exclude='LICENSE' \
    --exclude='dist/' \
    --exclude='*.zip' \
    "${SOURCE_DIR}/" "${stage_dir}/"

glib-compile-schemas "${stage_dir}/schemas"

if "$dry_run"; then
    printf 'Dry run: %s -> %s\n' "$SOURCE_DIR" "$TARGET_DIR"
    if [[ -d "$TARGET_DIR" ]]; then
        rsync -ain --delete "${stage_dir}/" "${TARGET_DIR}/"
    else
        printf 'Target directory would be created.\n'
        rsync -ain "${stage_dir}/" "${TARGET_DIR}/"
    fi
    exit 0
fi

mkdir -p -- "$EXTENSIONS_DIR" "$TARGET_DIR"
# -i itemizes the transfer so we can tell whether metadata.json itself changed.
# Note: -n is rsync's --dry-run, so it must NOT be used for the real deploy.
rsync_out="$(rsync -ai --delete "${stage_dir}/" "${TARGET_DIR}/")"
printf '%s\n' "$rsync_out"
metadata_changed=false
if grep -Eq '(^|[^a-zA-Z])metadata\.json$' <<<"$rsync_out"; then
    metadata_changed=true
fi
printf 'Deployed %s to %s\n' "$UUID" "$TARGET_DIR"

if ! "$reload_extension"; then
    printf 'Reload skipped (--no-reload).\n'
    exit 0
fi

if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf 'Deployment finished, but gnome-extensions is unavailable; reload manually.\n' >&2
    exit 0
fi

if gnome-extensions list --enabled | grep -Fxq "$UUID"; then
    gnome-extensions disable "$UUID"
    gnome-extensions enable "$UUID"
    printf 'Extension disabled and enabled successfully.\n'
else
    printf 'Extension was disabled before deployment and remains disabled.\n'
fi

if [[ "$metadata_changed" == true ]]; then
    # GNOME Shell parses metadata.json in createExtensionObject(), reached only
    # via reloadExtension(). `gnome-extensions disable/enable` goes through
    # _onEnabledExtensionsChanged, which reuses the cached metadata object, and
    # the ReloadExtension D-Bus method is a deprecated no-op in GNOME 51. So a
    # shell restart is normally required for a shell-version change to apply.
    printf '\nmetadata.json changed. GNOME Shell cached the old metadata at startup;\n'
    printf 'disable/enable alone will NOT apply it (ReloadExtension is a no-op).\n'
    if "$force_reload"; then
        # Toggling the version-validation key makes _onVersionValidationChanged
        # call reloadExtension() for every extension, which re-reads metadata.
        if command -v gsettings >/dev/null 2>&1; then
            printf 'Forcing a full reload via disable-extension-version-validation...\n'
            gsettings set org.gnome.shell disable-extension-version-validation true
            gsettings set org.gnome.shell disable-extension-version-validation false
            printf 'Done. NOTE: that toggle also drops every OUT OF DATE extension\n'
            printf 'from org.gnome.shell enabled-extensions; check it with:\n'
            printf '  gsettings get org.gnome.shell enabled-extensions\n'
        else
            printf 'gsettings is unavailable; log out and back in instead.\n'
        fi
    else
        printf 'Log out and back in to apply it, or re-run with --force-reload.\n'
    fi
fi

if [[ "${XDG_SESSION_TYPE:-}" == wayland ]]; then
    printf 'If JavaScript changes remain cached, log out and back in to reload GNOME Shell on Wayland.\n'
fi
