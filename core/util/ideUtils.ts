import { IDE } from "..";

import {
  findUriInDirs,
  getCleanUriPath,
  joinEncodedUriPathSegmentToUri,
  joinPathsToUri,
  pathToUriPathSegment,
} from "./uri";

/*
  This function takes a relative (to workspace) filepath
  And checks each workspace for if it exists or not
  Only returns fully resolved URI if it exists
*/
export async function resolveRelativePathInDir(
  path: string,
  ide: IDE,
  dirUriCandidates?: string[],
): Promise<string | undefined> {
  const dirs = dirUriCandidates ?? (await ide.getWorkspaceDirs());
  for (const dirUri of dirs) {
    const fullUri = joinPathsToUri(dirUri, path);
    if (await ide.fileExists(fullUri)) {
      return fullUri;
    }
  }

  return undefined;
}

/*
  Models copy paths out of terminal output and error messages, so a tool
  argument can arrive as a file URI or an OS-absolute path rather than the
  workspace-relative path the tools expect. Reduce any of those to a
  workspace-relative path. The workspace root itself normalizes to "".
*/
function normalizeToWorkspaceRelative(path: string, dirs: string[]): string {
  let normalized = path.trim().replaceAll("\\", "/");

  if (normalized.includes("://")) {
    try {
      const { relativePathOrBasename, foundInDir } = findUriInDirs(
        normalized,
        dirs,
      );
      normalized = foundInDir
        ? relativePathOrBasename
        : getCleanUriPath(normalized);
    } catch {
      // Not a parseable URI after all; fall through to the textual handling.
    }
  } else if (normalized.startsWith("/")) {
    const absolute = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
    for (const dir of dirs) {
      const dirPath = getCleanUriPath(dir);
      if (absolute === dirPath) {
        return "";
      }
      if (absolute.startsWith(`${dirPath}/`)) {
        normalized = absolute.slice(dirPath.length + 1);
        break;
      }
    }
  }

  return normalized
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "")
    .replace(/^\.$/, "");
}

/*
  Models routinely name a real file with a slightly wrong path, usually a
  missing or extra leading folder. Resolve the exact path when it exists,
  otherwise match the longest trailing part of it that identifies exactly one
  file, so an otherwise correct path does not fail over a prefix the model
  could not have known. Gives up when a suffix is ambiguous rather than
  guessing at the wrong file.
*/
export async function resolveWorkspacePath(
  path: string,
  ide: IDE,
): Promise<string | undefined> {
  const dirs = await ide.getWorkspaceDirs();
  const relativePath = normalizeToWorkspaceRelative(path, dirs);
  if (!relativePath) {
    return undefined;
  }

  const exactMatch = await resolveRelativePathInDir(relativePath, ide, dirs);
  if (exactMatch) {
    return exactMatch;
  }

  const segments = relativePath.split("/").filter(Boolean);

  for (let i = 0; i < segments.length; i++) {
    const suffix = segments.slice(i).join("/");
    let matches: string[] = [];
    try {
      // Results are newline-joined per workspace dir, so directories without
      // a match contribute empty entries that would look like hits.
      matches = (await ide.getFileResults(`**/${suffix}`))
        .map((match) => match.trim())
        .filter(Boolean);
    } catch {
      // Searching is best effort.
      return undefined;
    }

    if (matches.length > 1) {
      // Ambiguous: a shorter suffix can only match more files.
      return undefined;
    }
    if (matches.length === 1) {
      // Matches come back workspace-relative; turn one into a real URI.
      return resolveRelativePathInDir(matches[0], ide, dirs);
    }
  }

  return undefined;
}

/*
  Directory equivalent of resolveWorkspacePath. Directories are not returned
  by file search, so the longest unambiguous suffix is derived from the paths
  of the files inside it.
*/
export async function resolveWorkspaceDir(
  dirPath: string,
  ide: IDE,
): Promise<string | undefined> {
  const dirs = await ide.getWorkspaceDirs();
  const relativePath = normalizeToWorkspaceRelative(dirPath, dirs);

  // "/", ".", and the absolute path of the workspace itself all mean the root.
  if (!relativePath) {
    return dirs.length === 1 ? dirs[0] : undefined;
  }

  const exactMatch = await resolveRelativePathInDir(relativePath, ide, dirs);
  if (exactMatch) {
    return exactMatch;
  }

  const segments = relativePath.split("/").filter(Boolean);

  for (let i = 0; i < segments.length; i++) {
    const suffix = segments.slice(i).join("/");
    let files: string[] = [];
    try {
      files = (await ide.getFileResults(`**/${suffix}/**`))
        .map((file) => file.trim().replaceAll("\\", "/"))
        .filter(Boolean);
    } catch {
      return undefined;
    }

    const candidates = new Set<string>();
    for (const file of files) {
      if (file.startsWith(`${suffix}/`)) {
        candidates.add(suffix);
        continue;
      }
      const marker = `/${suffix}/`;
      const index = file.indexOf(marker);
      if (index !== -1) {
        candidates.add(file.slice(0, index + marker.length - 1));
      }
    }

    if (candidates.size > 1) {
      return undefined;
    }
    if (candidates.size === 1) {
      return resolveRelativePathInDir([...candidates][0], ide, dirs);
    }
  }

  return undefined;
}

/*
  Same as above but in this case the relative path does not need to exist (e.g. file to be created, etc)
  Checks closes match with the dirs, path segment by segment
  and based on which workspace has the closest matching path, returns resolved URI
  If no meaninful path match just concatenates to first dir's uri
*/
export async function inferResolvedUriFromRelativePath(
  _relativePath: string,
  ide: IDE,
  dirCandidates?: string[],
): Promise<string> {
  const relativePath = _relativePath.trim().replaceAll("\\", "/");
  const dirs = dirCandidates ?? (await ide.getWorkspaceDirs());

  if (dirs.length === 0) {
    throw new Error("inferResolvedUriFromRelativePath: no dirs provided");
  }

  const segments = pathToUriPathSegment(relativePath).split("/");
  // Generate all possible suffixes from shortest to longest
  const suffixes: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    suffixes.push(segments.slice(i).join("/"));
  }

  // For each suffix, try to find a unique matching dir/file
  for (const suffix of suffixes) {
    const uris = dirs.map((dir) => ({
      dir,
      partialUri: joinEncodedUriPathSegmentToUri(dir, suffix),
    }));
    const promises = uris.map(async ({ partialUri, dir }) => {
      const exists = await ide.fileExists(partialUri);
      return {
        dir,
        partialUri,
        exists,
      };
    });
    const existenceChecks = await Promise.all(promises);

    const existingUris = existenceChecks.filter(({ exists }) => exists);

    // If exactly one directory matches, use it
    if (existingUris.length === 1) {
      return joinEncodedUriPathSegmentToUri(
        existingUris[0].dir,
        segments.join("/"),
      );
    }
  }

  // Sometimes the model will decide to only output the base name or small number of path parts
  // in which case we shouldn't create a new file if it matches the current file
  const activeFile = await ide.getCurrentFile();
  if (activeFile && activeFile.path.endsWith(relativePath)) {
    return activeFile.path;
  }

  // If no unique match found, use the first directory
  return joinPathsToUri(dirs[0], relativePath);
}
