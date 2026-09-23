#!/bin/sh
set -eu

tracked="$(
  git ls-files |
    grep -Ei '(^|/)([^/]+\.(p8|p12|cer|mobileprovision)|credentials\.json)$' ||
    true
)"

if [ -n "$tracked" ]; then
  echo "Apple signing credential artifacts must not be tracked by Git:" >&2
  printf '%s\n' "$tracked" >&2
  exit 1
fi

local_files="$(
  find . \
    \( -path './.git' -o -path './node_modules' -o -path './.pythonlibs' -o -path '*/node_modules' -o -path '*/static-build' \) -prune -o \
    -type f \( -iname '*.p8' -o -iname '*.p12' -o -iname '*.cer' -o -iname '*.mobileprovision' -o -iname 'credentials.json' \) -print
)"

if [ -n "$local_files" ]; then
  echo "Apple signing credential artifacts must not be stored in the repository worktree:" >&2
  printf '%s\n' "$local_files" >&2
  exit 1
fi

config_files="$(
  git grep -I -l -E 'ascApiKey(Path|Id|IssuerId)|appleApi(KeyPath|KeyId|IssuerId)' -- . \
    ':!scripts/check-no-signing-credentials.sh' ||
    true
)"

if [ -n "$config_files" ]; then
  echo "Local App Store Connect key configuration must not be committed:" >&2
  printf '%s\n' "$config_files" >&2
  exit 1
fi

echo "No Apple signing credential artifacts or local key configuration found."