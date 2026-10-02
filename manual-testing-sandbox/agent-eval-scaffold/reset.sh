#!/usr/bin/env bash
# Regenerates the empty workspace so every run starts identically.
#
# Unlike agent-eval/'s fixture, there is nothing to reset the content of -
# the point of this scenario is that none of the target files exist yet, so
# the agent has to scaffold a project structure from scratch rather than fix
# files that are already there

set -euo pipefail
cd "$(dirname "$0")"
rm -rf workspace
mkdir -p workspace
echo "workspace reset - empty, nothing to scaffold from yet"
