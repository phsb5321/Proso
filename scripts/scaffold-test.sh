#!/usr/bin/env bash
# scaffold-test.sh — Generate test boilerplate for a source file
#
# Usage:
#   ./scripts/scaffold-test.sh packages/extension/src/adapters/audio/direct.adapter.ts
#   ./scripts/scaffold-test.sh packages/server/src/core/tts/tts.service.ts
#
# Detects file type from path and generates appropriate test template:
#   - adapters/  → contract test (port-conformance pattern)
#   - handlers/  → handler test (registry + mock deps)
#   - core/      → unit test (pure logic, mock ports)
#   - other      → unit test (generic)

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <source-file-path>"
  echo "Example: $0 packages/extension/src/adapters/audio/direct.adapter.ts"
  exit 1
fi

SOURCE_FILE="$1"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Error: File not found: $SOURCE_FILE"
  exit 1
fi

# Extract components from path
FILENAME=$(basename "$SOURCE_FILE" .ts)
DIRNAME=$(dirname "$SOURCE_FILE")

# Determine package and relative path
if [[ "$SOURCE_FILE" == *"packages/extension/"* ]]; then
  PACKAGE="extension"
  REL_PATH="${SOURCE_FILE#*packages/extension/src/}"
  TEST_BASE="packages/extension/tests"
elif [[ "$SOURCE_FILE" == *"packages/server/"* ]]; then
  PACKAGE="server"
  REL_PATH="${SOURCE_FILE#*packages/server/src/}"
  TEST_BASE="packages/server/tests"
elif [[ "$SOURCE_FILE" == *"packages/shared/"* ]]; then
  PACKAGE="shared"
  REL_PATH="${SOURCE_FILE#*packages/shared/src/}"
  TEST_BASE="packages/shared/tests"
else
  echo "Error: File must be in packages/extension, packages/server, or packages/shared"
  exit 1
fi

REL_DIR=$(dirname "$REL_PATH")

# Determine test type from path
if [[ "$REL_DIR" == adapters/* ]]; then
  TEST_TYPE="contract"
  TEST_SUFFIX=".contract.test.ts"
elif [[ "$REL_DIR" == handlers/* || "$FILENAME" == *".handlers" ]]; then
  TEST_TYPE="handler"
  TEST_SUFFIX=".test.ts"
elif [[ "$REL_DIR" == core/* ]]; then
  TEST_TYPE="unit"
  TEST_SUFFIX=".test.ts"
else
  TEST_TYPE="unit"
  TEST_SUFFIX=".test.ts"
fi

# Server tests use .spec.ts convention
if [[ "$PACKAGE" == "server" ]]; then
  TEST_SUFFIX=".spec.ts"
fi

# Determine test output path
if [[ "$TEST_TYPE" == "contract" ]]; then
  TEST_DIR="$TEST_BASE/contract"
else
  TEST_DIR="$TEST_BASE/unit/$REL_DIR"
fi

TEST_FILE="$TEST_DIR/${FILENAME}${TEST_SUFFIX}"

# Check if test already exists
if [[ -f "$TEST_FILE" ]]; then
  echo "Test already exists: $TEST_FILE"
  exit 0
fi

# Create directory
mkdir -p "$TEST_DIR"

IMPORT_PREFIX="../../../src"

# Convert filename to PascalCase for class name guess
CLASS_NAME=$(echo "$FILENAME" | sed -E 's/(^|[-_.])([a-z])/\U\2/g')

# Generate test content based on type
case "$TEST_TYPE" in
  contract)
    cat > "$TEST_FILE" << TEMPLATE
/**
 * Contract test for ${CLASS_NAME}
 *
 * Verifies the adapter conforms to its port interface contract.
 * All adapters implementing the same port should pass identical tests.
 */

import { ${CLASS_NAME} } from '${IMPORT_PREFIX}/${REL_PATH%.ts}';

describe('${CLASS_NAME} (contract)', () => {
  let adapter: ${CLASS_NAME};

  beforeEach(() => {
    // TODO: Initialize adapter with test dependencies
    // adapter = new ${CLASS_NAME}(mockDep1, mockDep2);
  });

  it('should be defined', () => {
    // TODO: Replace with actual contract assertions
    expect(true).toBe(true);
  });

  // TODO: Add contract tests that verify port interface behavior
  // These tests should be identical across all adapters implementing the same port
});
TEMPLATE
    ;;

  handler)
    cat > "$TEST_FILE" << TEMPLATE
/**
 * Handler test for ${CLASS_NAME}
 *
 * Tests message handler registration and dispatch behavior.
 */

import { HandlerRegistry } from '${IMPORT_PREFIX}/handlers/registry';

describe('${CLASS_NAME}', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
    // TODO: Register handlers
    // register${CLASS_NAME}(registry);
  });

  it('should register expected handlers', () => {
    // TODO: Check handler registration
    expect(registry.getRegisteredNames().length).toBeGreaterThan(0);
  });

  it('should handle valid messages', async () => {
    // TODO: Test handler dispatch
    // const result = await registry.dispatch('message.type', {});
    // expect(result.ok).toBe(true);
  });
});
TEMPLATE
    ;;

  unit)
    cat > "$TEST_FILE" << TEMPLATE
/**
 * Unit test for ${CLASS_NAME}
 */

import { ${CLASS_NAME} } from '${IMPORT_PREFIX}/${REL_PATH%.ts}';

describe('${CLASS_NAME}', () => {
  // TODO: Add mock factories for dependencies
  // function createMock(): jest.Mocked<Dependency> { ... }

  it('should be defined', () => {
    // TODO: Replace with actual unit test assertions
    expect(true).toBe(true);
  });
});
TEMPLATE
    ;;
esac

echo "Created ${TEST_TYPE} test: ${TEST_FILE}"
echo "  Source: ${SOURCE_FILE}"
echo "  Type:   ${TEST_TYPE}"
