#!/bin/bash
# validate_roadmap.sh

echo "Validating docs/ROADMAP.md structure..."

FAIL=0

# Check if Phase 29 is present
if grep -q "## Phase 29:" docs/ROADMAP.md; then
  echo "✅ Phase 29 section exists."
else
  echo "❌ Error: Phase 29 section missing."
  FAIL=1
fi

# Check if Phase 30 is present
if grep -q "## Phase 30:" docs/ROADMAP.md; then
  echo "✅ Phase 30 section exists."
else
  echo "❌ Error: Phase 30 section missing."
  FAIL=1
fi

# Check if Phase 28 is moved out to legacy
if grep -q "## Phase 28:" docs/ROADMAP.md; then
  echo "❌ Error: Phase 28 section is still in docs/ROADMAP.md (should be in LEGACY)."
  FAIL=1
else
  echo "✅ Phase 28 section removed from docs/ROADMAP.md."
fi

if grep -q "Phase 28:" docs/ROADMAP_LEGACY.md; then
  echo "✅ Phase 28 section found in docs/ROADMAP_LEGACY.md."
else
  echo "❌ Error: Phase 28 missing from docs/ROADMAP_LEGACY.md."
  FAIL=1
fi

# Check if PR #640 is referenced
if grep -q "PR #640" docs/ROADMAP.md; then
  echo "✅ PR #640 referenced in docs/ROADMAP.md."
else
  echo "❌ Error: PR #640 not referenced in docs/ROADMAP.md."
  FAIL=1
fi

if grep -q "PR #640" docs/todo.md; then
  echo "✅ PR #640 referenced in docs/todo.md."
else
  echo "❌ Error: PR #640 not referenced in docs/todo.md."
  FAIL=1
fi

if [ $FAIL -ne 0 ]; then
  echo "Roadmap validation failed."
  # Just exit with the fail code so it fails in a CI script context or similar.
  # We will just return the non-zero status code without calling 'exit 1' explicitly to avoid blocking bash session here.
  return 1 2>/dev/null || (false)
else
  echo "Roadmap validation passed."
fi
