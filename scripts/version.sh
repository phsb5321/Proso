#!/usr/bin/env bash
# Version Management Script for VoxPage
# Manages semantic versioning across package.json and manifest.json
#
# Usage:
#   ./scripts/version.sh                    # Show current version
#   ./scripts/version.sh patch              # Bump patch version (1.0.0 -> 1.0.1)
#   ./scripts/version.sh minor              # Bump minor version (1.0.0 -> 1.1.0)
#   ./scripts/version.sh major              # Bump major version (1.0.0 -> 2.0.0)
#   ./scripts/version.sh set 1.2.3          # Set specific version
#   ./scripts/version.sh --help             # Show help

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PACKAGE_JSON="$PROJECT_ROOT/package.json"
MANIFEST_JSON="$PROJECT_ROOT/manifest.json"

# Get current version from package.json
get_current_version() {
    grep -o '"version": *"[^"]*"' "$PACKAGE_JSON" | head -1 | sed 's/"version": *"\([^"]*\)"/\1/'
}

# Parse version into components
parse_version() {
    local version="$1"
    echo "$version" | sed 's/\([0-9]*\)\.\([0-9]*\)\.\([0-9]*\).*/\1 \2 \3/'
}

# Validate version format
validate_version() {
    local version="$1"
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}Error: Invalid version format '$version'. Expected: X.Y.Z${NC}" >&2
        return 1
    fi
}

# Update version in both files
update_version() {
    local new_version="$1"
    local current_version
    current_version=$(get_current_version)

    echo -e "${BLUE}Updating version: ${YELLOW}$current_version${NC} -> ${GREEN}$new_version${NC}"

    # Update package.json
    if [[ -f "$PACKAGE_JSON" ]]; then
        sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
        echo -e "  ${GREEN}✓${NC} Updated package.json"
    fi

    # Update manifest.json
    if [[ -f "$MANIFEST_JSON" ]]; then
        sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$MANIFEST_JSON"
        echo -e "  ${GREEN}✓${NC} Updated manifest.json"
    fi

    echo -e "\n${GREEN}Version updated to $new_version${NC}"
    echo -e "${YELLOW}Remember to commit these changes:${NC}"
    echo -e "  git add package.json manifest.json"
    echo -e "  git commit -m \"chore(release): bump version to $new_version\""
}

# Bump version component
bump_version() {
    local bump_type="$1"
    local current_version
    current_version=$(get_current_version)
    
    read -r major minor patch <<< "$(parse_version "$current_version")"

    case "$bump_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo -e "${RED}Error: Unknown bump type '$bump_type'${NC}" >&2
            echo "Use: major, minor, or patch" >&2
            exit 1
            ;;
    esac

    local new_version="$major.$minor.$patch"
    update_version "$new_version"
}

# Show help
show_help() {
    cat << EOF
VoxPage Version Management

Usage:
  ./scripts/version.sh                    Show current version
  ./scripts/version.sh patch              Bump patch version (1.0.0 -> 1.0.1)
  ./scripts/version.sh minor              Bump minor version (1.0.0 -> 1.1.0)
  ./scripts/version.sh major              Bump major version (1.0.0 -> 2.0.0)
  ./scripts/version.sh set <version>      Set specific version (e.g., 1.2.3)
  ./scripts/version.sh --help             Show this help

Semantic Versioning:
  MAJOR  Breaking changes, incompatible API changes
  MINOR  New features, backwards compatible
  PATCH  Bug fixes, backwards compatible

Examples:
  ./scripts/version.sh patch              # 1.0.0 -> 1.0.1
  ./scripts/version.sh minor              # 1.0.1 -> 1.1.0
  ./scripts/version.sh major              # 1.1.0 -> 2.0.0
  ./scripts/version.sh set 2.0.0-beta.1   # Set pre-release version

Files Updated:
  - package.json
  - manifest.json

EOF
}

# Main
main() {
    case "${1:-}" in
        "")
            current=$(get_current_version)
            echo -e "Current version: ${GREEN}$current${NC}"
            ;;
        major|minor|patch)
            bump_version "$1"
            ;;
        set)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Error: Version argument required${NC}" >&2
                echo "Usage: ./scripts/version.sh set <version>" >&2
                exit 1
            fi
            validate_version "$2"
            update_version "$2"
            ;;
        -h|--help|help)
            show_help
            ;;
        *)
            echo -e "${RED}Error: Unknown command '$1'${NC}" >&2
            echo "Run './scripts/version.sh --help' for usage" >&2
            exit 1
            ;;
    esac
}

main "$@"
