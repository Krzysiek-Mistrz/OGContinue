// Works around a bug in @neon-rs/load's glibc-vs-musl detection: it relies on
// process.report.getReport().header.glibcVersionRuntime, which is present under
// plain Node.js but comes back incomplete inside VS Code's Electron-based
// extension host. That makes currentTarget() wrongly return "linux-x64-musl"
// on ordinary glibc Linux systems, so the correct "@lancedb/vectordb-linux-x64-gnu"
// native binding is never required and LanceDB indexing fails to load.
//
// This patches isGlibc() to add a fallback: when process.report doesn't answer,
// check for the presence of the musl dynamic loader file. Its absence is a
// reliable signal that the system is glibc-based (musl is only the default on
// distros like Alpine).
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "core",
  "node_modules",
  "@neon-rs",
  "load",
  "dist",
  "index.js",
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, "utf8");
const marker = "// patched-by-ogcontinue-libc-fallback";

if (original.includes(marker)) {
  process.exit(0);
}

const needle = `function isGlibc() {
    // Cast to unknown to work around a bug in the type definition:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/40140
    const report = process.report?.getReport();
    if ((typeof report !== 'object') || !report || (!('header' in report))) {
        return false;
    }
    const header = report.header;
    return (typeof header === 'object') &&
        !!header &&
        ('glibcVersionRuntime' in header);
}`;

const replacement = `${marker}
function isGlibc() {
    const report = process.report?.getReport();
    if ((typeof report === 'object') && report && ('header' in report)) {
        const header = report.header;
        if ((typeof header === 'object') && !!header) {
            if ('glibcVersionRuntime' in header) {
                return true;
            }
        }
    }
    // process.report is unreliable inside Electron-based hosts (e.g. the
    // VS Code extension host). Fall back to checking for musl's loader file.
    try {
        const fs = require('fs');
        return !fs.existsSync('/lib/ld-musl-x86_64.so.1') &&
            !fs.existsSync('/lib/ld-musl-aarch64.so.1');
    } catch {
        return false;
    }
}`;

if (!original.includes(needle)) {
  console.warn(
    "[patch-neon-libc-detection] Expected code not found — skipping (dependency version may have changed).",
  );
  process.exit(0);
}

fs.writeFileSync(target, original.replace(needle, replacement));
console.log("[patch-neon-libc-detection] Patched @neon-rs/load glibc detection.");
