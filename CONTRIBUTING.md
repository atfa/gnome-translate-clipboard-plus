# Contributing

Issues and pull requests are welcome at <https://github.com/atfa/gnome-translate-clipboard-plus>.

Please keep changes compatible with the GNOME Shell versions listed in `metadata.json`, preserve cleanup symmetry between `enable()` and `disable()`, and do not add minified or generated JavaScript to the extension package.

Before submitting a change:

```bash
glib-compile-schemas --strict --dry-run schemas
git diff --check
./build.sh
```

Test extension changes in a nested GNOME Shell session when possible. On GNOME 49 and later, the `mutter-devkit` package provides the supported nested testing environment.

New user-visible strings should use gettext. Never commit API keys, passwords, screenshots containing private data, or locally generated `schemas/gschemas.compiled` files.
