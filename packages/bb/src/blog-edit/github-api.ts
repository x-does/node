export function isGitHubApiNotFoundError(error: unknown) {
  return error instanceof Error && /^GitHub API 404:/.test(error.message);
}

export function isGitHubApiConflictError(error: unknown) {
  return error instanceof Error && /^GitHub API 409:/.test(error.message);
}
