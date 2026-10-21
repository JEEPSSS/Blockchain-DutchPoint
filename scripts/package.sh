#!/bin/sh
# Builds the NTULearn submission zip from the last commit, including the git history that the
# AI Audit Report cites as evidence.
# Usage: npm run package                        -> DutchPoint.zip in the repository root
#        GROUP_NAME=OtherName npm run package   -> OtherName.zip
set -eu

name="${GROUP_NAME:-DutchPoint}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

# The zip is built from commits, so anything uncommitted (or never added) would be silently missing.
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit (or stash) these changes first; the zip is built from the last commit:" >&2
  git status --short >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if upstream="$(git rev-parse --verify --quiet '@{u}')" && [ "$upstream" != "$(git rev-parse HEAD)" ]; then
  echo "Note: $branch differs from its GitHub copy; the zip uses your local commits." >&2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# A fresh single-branch clone holds only tracked files plus this branch's history: no node_modules,
# build output, .env or local deployment record.
git clone --quiet --no-local --single-branch --branch "$branch" "$root" "$work/$name"
if remote="$(git remote get-url origin 2>/dev/null)"; then
  git -C "$work/$name" remote set-url origin "$remote"
fi

rm -f "$root/$name.zip"
(cd "$work" && zip -qr "$root/$name.zip" "$name")

commits="$(git rev-list --count HEAD)"
echo "Wrote $name.zip ($(du -h "$name.zip" | cut -f1 | tr -d ' ')): $branch at $(git rev-parse --short HEAD), $commits commits of history."
