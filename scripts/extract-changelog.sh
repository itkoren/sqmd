#!/usr/bin/env bash
# extract-changelog.sh — extract release notes for a given version from CHANGELOG.md
#
# Usage:
#   ./scripts/extract-changelog.sh <version>
#
# Examples:
#   ./scripts/extract-changelog.sh v0.2.0
#   ./scripts/extract-changelog.sh 0.2.0
#
# Behaviour:
#   1. Looks for ## [version] section in CHANGELOG.md
#   2. Falls back to ## [Unreleased] if the version section is not found
#   3. Strips leading/trailing blank lines from the extracted content
#   4. Exits with code 1 if neither section has content

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

# Strip leading 'v'
VERSION="${VERSION#v}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANGELOG="${SCRIPT_DIR}/../CHANGELOG.md"

if [ ! -f "$CHANGELOG" ]; then
  echo "Error: CHANGELOG.md not found at ${CHANGELOG}" >&2
  exit 1
fi

# Extract content between ## [VERSION] and the next ## [ section
extract_section() {
  local heading="$1"
  awk "
    /^## \[${heading}\]/ { found=1; next }
    found && /^## \[/    { exit }
    found && /^---$/     { next }
    found                { print }
  " "$CHANGELOG" | sed -e '/./,$!d' -e 's/[[:space:]]*$//'
  # awk:  skip --- separators
  # sed:  strip leading blank lines, strip trailing whitespace per line
}

NOTES="$(extract_section "$VERSION")"

# Fall back to [Unreleased] if no versioned section found
if [ -z "$(echo "$NOTES" | tr -d '[:space:]')" ]; then
  NOTES="$(extract_section "Unreleased")"
fi

if [ -z "$(echo "$NOTES" | tr -d '[:space:]')" ]; then
  echo "Error: No changelog content found for version '${VERSION}' or [Unreleased]" >&2
  exit 1
fi

echo "$NOTES"
