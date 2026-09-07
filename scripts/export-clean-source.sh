#!/bin/sh
set -eu

if [ "${1:-}" = "--" ]; then shift; fi
destination="${1:-/tmp/tbm-clean-source}"
case "$destination" in
  /tmp/*) ;;
  *) echo "Destination must be under /tmp to avoid overwriting the workspace." >&2; exit 1 ;;
esac

rm -rf "$destination"
mkdir -p "$destination"
tar \
  --exclude='.git' --exclude='*/.git' \
  --exclude='node_modules' --exclude='*/node_modules' \
  --exclude='.cache' --exclude='*/.cache' \
  --exclude='.config' --exclude='*/.config' \
  --exclude='.local' --exclude='*/.local' \
  --exclude='.agents' --exclude='*/.agents' \
  --exclude='.pythonlibs' --exclude='*/.pythonlibs' \
  --exclude='.expo' --exclude='*/.expo' \
  --exclude='attached_assets' --exclude='*/attached_assets' \
  --exclude='screenshots' --exclude='*/screenshots' \
  --exclude='*/dist' \
  --exclude='*/static-build' \
  --exclude='*.p8' --exclude='*.p12' --exclude='*.cer' --exclude='*.mobileprovision' \
  --exclude='.env' --exclude='.env.*' --exclude='!.env.example' \
  -cf - . | tar -xf - -C "$destination"

test ! -e "$destination/.git"
sh "$destination/scripts/scan-source-secrets.sh" "$destination"
printf '%s\n' "Clean source exported to $destination"