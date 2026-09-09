// A relative-looking file path, e.g. "math_utils/stats.py". Used for both the
// up-front task plan and, as a fallback, guessing a target from narration.
const FILE_PATH_MENTION = /\b[\w][\w-]*(?:\/[\w][\w-]*)+\.[A-Za-z0-9]{1,10}\b/g;

export function extractFilePathMentions(text: string): string[] {
  return Array.from(new Set(text.match(FILE_PATH_MENTION) ?? []));
}

// A request often names a file as the outcome to check, not to change - "fix
// A and B so that src/main.py runs" - and treating it as a plan target means
// the task can never finish, since nothing will ever edit it.
const PURPOSE_CLAUSE =
  /\b(so that|so it|so they|such that|in order (?:to|that)|to make sure|to ensure|so as to|and (?:then )?(?:verify|check|confirm|run))\b/i;

/** Files a request asks to be changed - drops anything named only in a trailing purpose clause. */
export function extractTaskTargets(text: string): string[] {
  const purpose = PURPOSE_CLAUSE.exec(text);
  if (!purpose) {
    return extractFilePathMentions(text);
  }
  const targets = extractFilePathMentions(text.slice(0, purpose.index));
  // If every path lived in the purpose clause it was describing the work
  // after all, not just the outcome ("run src/main.py to make sure...").
  return targets.length > 0 ? targets : extractFilePathMentions(text);
}

/** Files named as the outcome, not the work - kept separately as things to verify, not edit. */
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
