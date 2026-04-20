import test from 'node:test';
import assert from 'node:assert/strict';

import { isGitHubApiConflictError, isGitHubApiNotFoundError } from './github-api';

test('isGitHubApiNotFoundError returns true for GitHub 404 errors', () => {
  assert.equal(isGitHubApiNotFoundError(new Error('GitHub API 404: {"message":"Not Found"}')), true);
});

test('isGitHubApiNotFoundError returns false for non-404 GitHub errors', () => {
  assert.equal(isGitHubApiNotFoundError(new Error('GitHub API 500: boom')), false);
});

test('isGitHubApiNotFoundError returns false for non-Error values', () => {
  assert.equal(isGitHubApiNotFoundError('GitHub API 404: nope'), false);
});

test('isGitHubApiConflictError returns true for GitHub 409 errors', () => {
  assert.equal(
    isGitHubApiConflictError(new Error('GitHub API 409: {"message":"blog.sqlite does not match abc123"}')),
    true,
  );
});

test('isGitHubApiConflictError returns false for non-409 errors', () => {
  assert.equal(isGitHubApiConflictError(new Error('GitHub API 404: nope')), false);
});
