const FILE_PATH_MENTION = /\b[\w][\w-]*(?:\/[\w][\w-]*)+\.[A-Za-z0-9]{1,10}\b/g;

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
  return extractFilePathMentions(text.slice(purpose.index)).filter(
    (path) => !changeTargets.includes(path),
  );
}
