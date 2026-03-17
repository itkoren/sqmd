#!/usr/bin/env bash
# prepare-release.sh — prepare CHANGELOG.md and package.json for a new release
#
# Usage:
#   ./scripts/prepare-release.sh <version>
#
# Examples:
#   ./scripts/prepare-release.sh 0.2.0
#   ./scripts/prepare-release.sh v0.2.0
#
# What this script does:
#   1. Strips 'v' prefix from version
#   2. Renames ## [Unreleased] → ## [version] - YYYY-MM-DD in CHANGELOG.md
#   3. Inserts a fresh ## [Unreleased] section with empty categories above it
#   4. Updates package.json "version" field (without creating a git tag)
#
# What this script does NOT do:
#   - Commit, tag, or push anything (the AI agent / developer does that)
#
# After running, do:
#   git add CHANGELOG.md package.json package-lock.json
#   git commit -m "chore: prepare release v<version>"
#   git tag v<version>
#   git push origin <branch> v<version>

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

# Strip leading 'v'
VERSION="${VERSION#v}"

# Validate semver-ish format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]'; then
  echo "Error: version '${VERSION}' does not look like semver (expected X.Y.Z)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."
CHANGELOG="${REPO_ROOT}/CHANGELOG.md"
PACKAGE_JSON="${REPO_ROOT}/package.json"

if [ ! -f "$CHANGELOG" ]; then
  echo "Error: CHANGELOG.md not found" >&2
  exit 1
fi

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "Error: package.json not found" >&2
  exit 1
fi

# Verify [Unreleased] section exists
if ! grep -q "^## \[Unreleased\]" "$CHANGELOG"; then
  echo "Error: No '## [Unreleased]' section found in CHANGELOG.md" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
TMPFILE="$(mktemp)"

# Replace [Unreleased] with versioned heading and prepend a new empty [Unreleased]
awk \
  -v version="$VERSION" \
  -v date="$DATE" \
  '
  /^## \[Unreleased\]/ {
    print "## [Unreleased]"
    print ""
    print "### Added"
    print ""
    print "### Changed"
    print ""
    print "### Fixed"
    print ""
    print "### Deprecated"
    print ""
    print "### Removed"
    print ""
    print "### Security"
    print ""
    print "---"
    print ""
    print "## [" version "] - " date
    next
  }
  { print }
  ' "$CHANGELOG" > "$TMPFILE"

mv "$TMPFILE" "$CHANGELOG"
echo "✓ CHANGELOG.md: moved [Unreleased] → [${VERSION}] - ${DATE}"

# Update package.json version using npm (handles package-lock.json too)
npm version "${VERSION}" --no-git-tag-version --prefix "$REPO_ROOT" > /dev/null
echo "✓ package.json: version set to ${VERSION}"

echo ""
echo "Review the changes, then run:"
echo ""
echo "  git add CHANGELOG.md package.json package-lock.json"
echo "  git commit -m \"chore: prepare release v${VERSION}\""
echo "  git tag v${VERSION}"
echo "  git push origin \$(git branch --show-current) v${VERSION}"
