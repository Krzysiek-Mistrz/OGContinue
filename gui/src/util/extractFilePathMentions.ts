// branch is restricted to extensions that are actually code/config/doc files
const BARE_FILE_EXTENSIONS =
  "py|ts|tsx|js|jsx|mjs|cjs|go|rs|rb|php|java|kt|kts|c|h|cpp|cc|hpp|cs|swift|" +
  "m|scala|json|jsonc|yaml|yml|toml|ini|cfg|conf|md|mdx|txt|rst|sh|bash|zsh|" +
  "ps1|css|scss|less|html|htm|xml|sql|proto|graphql|lock|env";
const FILE_PATH_MENTION = new RegExp(
  String.raw`\b[\w][\w-]*(?:\/[\w][\w-]*)+\.[A-Za-z0-9]{1,10}\b` +
    String.raw`|\b[\w][\w-]*\.(?:${BARE_FILE_EXTENSIONS})\b`,
  "g",
);

export function extractFilePathMentions(text: string): string[] {
  return Array.from(new Set(text.match(FILE_PATH_MENTION) ?? []));
}

const PURPOSE_CLAUSE =
  /\b(so that|so it|so they|such that|in order (?:to|that)|to make sure|to ensure|so as to|and (?:then )?(?:verify|check|confirm|run))\b/i;

export function extractTaskTargets(text: string): string[] {
  const purpose = PURPOSE_CLAUSE.exec(text);
  if (!purpose) {
    return extractFilePathMentions(text);
  }
  const targets = extractFilePathMentions(text.slice(0, purpose.index));

  return targets.length > 0 ? targets : extractFilePathMentions(text);
}

export function extractVerifyTargets(text: string): string[] {
  const purpose = PURPOSE_CLAUSE.exec(text);
  if (!purpose) {
    return [];
  }
  const changeTargets = extractTaskTargets(text);
  const distinct = extractFilePathMentions(text.slice(purpose.index)).filter(
    (path) => !changeTargets.includes(path),
  );
  if (distinct.length > 0) {
    return distinct;
  }
  // treat the most recently named target as the thing to verify
  // instead of leaving verifyTargets empty and silently losing  signal
  return changeTargets.length > 0 ? [changeTargets[changeTargets.length - 1]] : [];
}
