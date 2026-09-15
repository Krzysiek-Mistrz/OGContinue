#!/usr/bin/env bash
# Rebuilds the artifacts probe.py feeds to the model, straight from the
# extension's own source, so the probe can never drift from what ships:
#   tools.json                - the real tool definitions, task_complete included
#   agent-system-message.txt  - the real agent system message
#   recover.cjs               - the real plain-text tool-call recovery
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
ESBUILD="$ROOT/core/node_modules/.bin/esbuild"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/dump.ts" <<'TS'
import { DEFAULT_AGENT_SYSTEM_MESSAGE } from "ROOT/core/llm/constructMessages";
import { allTools } from "ROOT/core/tools/index";
import { tryRecoverToolCallFromText } from "ROOT/core/llm/llms/Ollama";

if (process.argv[2] === "tools") {
  console.log(
    JSON.stringify(
      allTools.map((t) => ({ type: "function", function: t.function })),
      null,
      2,
    ),
  );
} else if (process.argv[2] === "system") {
  process.stdout.write(DEFAULT_AGENT_SYSTEM_MESSAGE);
} else {
  const names = allTools.map((t) => t.function.name);
  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    const r = tryRecoverToolCallFromText(input, names);
    process.stdout.write(JSON.stringify(r ? r.name : null));
  });
}
TS
sed -i "s|ROOT|$ROOT|g" "$TMP/dump.ts"

"$ESBUILD" "$TMP/dump.ts" --bundle --platform=node --format=cjs \
  --external:sqlite3 --external:sqlite --outfile=recover.cjs --log-level=error

node -r ./sqlite-stub.cjs recover.cjs tools > tools.json
node -r ./sqlite-stub.cjs recover.cjs system > agent-system-message.txt

"$ESBUILD" runner-entry.ts --bundle --platform=node --format=cjs \
  --external:sqlite3 --external:sqlite --outfile=runner.cjs --log-level=error

echo "rebuilt tools.json, agent-system-message.txt, recover.cjs, runner.cjs"
