import test from 'node:test';
import assert from 'node:assert/strict';

import { isGitHubApiNotFoundError } from './github-api';

test('isGitHubApiNotFoundError returns true for GitHub 404 errors', () => {
  assert.equal(isGitHubApiNotFoundError(new Error('GitHub API 404: {"message":"Not Found"}')), true);
});

test('isGitHubApiNotFoundError returns false for non-404 GitHub errors', () => {
  assert.equal(isGitHubApiNotFoundError(new Error('GitHub API 500: boom')), false);
});

test('isGitHubApiNotFoundError returns false for non-Error values', () => {
  assert.equal(isGitHubApiNotFoundError('GitHub API 404: nope'), false);
});
