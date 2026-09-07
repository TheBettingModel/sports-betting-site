#!/bin/sh
set -eu

root="${1:-.}"
patterns='(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{16,}|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@|gh[oprs]_[A-Za-z0-9]{20,})'

if grep -RInE \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=.local --exclude-dir=.cache --exclude-dir=.agents \
  --exclude-dir=attached_assets --exclude='pnpm-lock.yaml' \
  --exclude='.env.example' --exclude='scan-source-secrets.sh' \
  "$patterns" "$root"; then
  echo "Potential committed credential material detected." >&2
  exit 1
fi

echo "Source credential scan passed."