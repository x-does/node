export function isGitHubApiNotFoundError(error: unknown) {
  return error instanceof Error && /^GitHub API 404:/.test(error.message);
}
