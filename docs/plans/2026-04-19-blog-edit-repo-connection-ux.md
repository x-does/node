# Blog Editor Repo Connection UX Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make `/blog-edit` easier to connect to a new repository by adding a paste-friendly repository input, clearer target previews, and regression tests for the new repo-connection behavior.

**Architecture:** Extract repo-connection parsing and target-preview logic into a small pure TypeScript helper module under `packages/bb/src/blog-edit/`. Cover the helper with a lightweight `node:test` suite run through `tsx`, then wire the helper into the existing blog editor UI so the interactive page becomes easier to use without changing publish semantics.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, `tsx`, Node built-in `node:test`

---

### Task 1: Add failing tests for repository input parsing and target previews

**Objective:** Define the new repo-connection UX behavior in executable tests before touching production code.

**Files:**
- Create: `packages/bb/src/blog-edit/repo-connection.test.ts`
- Test: `packages/bb/src/blog-edit/repo-connection.test.ts`

**Step 1: Write failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRepositoryInput,
  describePublishTarget,
} from './repo-connection';

test('parseRepositoryInput accepts owner/repo syntax', () => {
  assert.deepEqual(parseRepositoryInput('x-does/blog'), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('parseRepositoryInput accepts GitHub URLs and strips .git', () => {
  assert.deepEqual(parseRepositoryInput('https://github.com/x-does/blog.git'), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('describePublishTarget shows repo, branch, sqlite, and draft file path', () => {
  assert.deepEqual(
    describePublishTarget({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'blogs',
      sqlitePath: 'blog.sqlite',
      slug: 'new-post',
    }),
    {
      ownerRepo: 'x-does/blog',
      branchLabel: 'main',
      sqliteLabel: 'blog.sqlite',
      postPath: 'blogs/new-post/blog.md',
    },
  );
});
```

**Step 2: Run test to verify failure**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: FAIL — module `./repo-connection` does not exist yet.

**Step 3: Write minimal implementation**

Do not implement production UI yet. Only add the smallest helper needed to satisfy the tests in the next task.

**Step 4: Run test to verify pass**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/bb/src/blog-edit/repo-connection.test.ts packages/bb/src/blog-edit/repo-connection.ts
git commit -m "test(blog-edit): cover repo connection helpers"
```

### Task 2: Implement the helper module for repo parsing and publish-target summaries

**Objective:** Add a small pure helper module that the UI can reuse for connection UX without duplicating parsing logic.

**Files:**
- Create: `packages/bb/src/blog-edit/repo-connection.ts`
- Modify: `packages/bb/src/blog-edit/repo-connection.test.ts`

**Step 1: Write/confirm failing test**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: FAIL until helper exports exist and match the test contract.

**Step 2: Write minimal implementation**

```ts
export type RepoConnectionSettings = {
  owner: string;
  repo: string;
  branch: string;
  baseDir: string;
  sqlitePath: string;
};

export function parseRepositoryInput(input: string) {
  const cleaned = input.trim().replace(/\.git$/i, '').replace(/\/+$/g, '');
  const fromUrl = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  const source = fromUrl ? `${fromUrl[1]}/${fromUrl[2]}` : cleaned;
  const match = source.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function describePublishTarget(settings: RepoConnectionSettings & { slug: string }) {
  return {
    ownerRepo: `${settings.owner}/${settings.repo}`,
    branchLabel: settings.branch,
    sqliteLabel: settings.sqlitePath,
    postPath: `${settings.baseDir}/${settings.slug}/blog.md`,
  };
}
```

**Step 3: Run test to verify pass**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: PASS

**Step 4: Run package typecheck**

Run: `npx tsc -p packages/bb/tsconfig.json --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts
git commit -m "feat(blog-edit): add repo connection helpers"
```

### Task 3: Add paste-friendly repository input to the editor settings

**Objective:** Let a user paste `owner/repo` or a full GitHub URL and apply it without manually editing owner and repo fields separately.

**Files:**
- Modify: `packages/bb/src/blog-edit/page.tsx`
- Use: `packages/bb/src/blog-edit/repo-connection.ts`
- Test: `packages/bb/src/blog-edit/repo-connection.test.ts`

**Step 1: Write failing test**

Extend the helper test with a case for whitespace and URL normalization:

```ts
test('parseRepositoryInput trims whitespace and trailing slash', () => {
  assert.deepEqual(parseRepositoryInput('  https://github.com/x-does/blog/  '), {
    owner: 'x-does',
    repo: 'blog',
  });
});
```

**Step 2: Run test to verify failure if needed**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: FAIL if normalization is incomplete.

**Step 3: Write minimal implementation**

In `packages/bb/src/blog-edit/page.tsx`:
- import `describePublishTarget` and `parseRepositoryInput`
- add a local `repoLocator` state initialized from current `owner/repo`
- keep `repoLocator` in sync when `settings.owner` or `settings.repo` changes
- add an `Apply repo locator` button in Settings that:
  - parses pasted input
  - updates `owner` and `repo`
  - keeps the current branch/baseDir/sqlite path intact
  - surfaces a clear success/error message

Code shape:

```ts
const [repoLocator, setRepoLocator] = useState(`${defaultSettings.owner}/${defaultSettings.repo}`);

useEffect(() => {
  setRepoLocator(`${settings.owner}/${settings.repo}`);
}, [settings.owner, settings.repo]);

function applyRepoLocator() {
  const parsed = parseRepositoryInput(repoLocator);
  if (!parsed) {
    setMsg('Enter a GitHub repo as owner/repo or https://github.com/owner/repo');
    setTab('settings');
    return;
  }

  setSettings((s) => ({ ...s, owner: parsed.owner, repo: parsed.repo }));
  setTab('editor');
  setMsg(`Connected editor to ${parsed.owner}/${parsed.repo}.`);
}
```

**Step 4: Run targeted verification**

Run:
- `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
- `npm run build`

Expected: both PASS.

**Step 5: Commit**

```bash
git add packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts
git commit -m "feat(blog-edit): support pasteable repo targets"
```

### Task 4: Add a visible target preview and connection guidance panel

**Objective:** Make it obvious where publish actions will write before the user authenticates or publishes.

**Files:**
- Modify: `packages/bb/src/blog-edit/page.tsx`
- Use: `packages/bb/src/blog-edit/repo-connection.ts`

**Step 1: Write failing test**

Add a helper test for empty slug fallback:

```ts
test('describePublishTarget falls back to a draft slug when title is empty', () => {
  assert.equal(
    describePublishTarget({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'blogs',
      sqlitePath: 'blog.sqlite',
      slug: '',
    }).postPath,
    'blogs/draft-post/blog.md',
  );
});
```

**Step 2: Run test to verify failure if needed**

Run: `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
Expected: FAIL until fallback behavior exists.

**Step 3: Write minimal implementation**

Render a compact preview block in `packages/bb/src/blog-edit/page.tsx` using helper output:

```tsx
const publishTarget = describePublishTarget({
  ...settings,
  slug: toSlug(title) || 'draft-post',
});
```

Display:
- target repo
- branch
- sqlite path
- next post file path
- short guidance: auth → choose repo → verify target → publish

**Step 4: Run targeted verification**

Run:
- `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
- `npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts
git commit -m "feat(blog-edit): preview publish target"
```

### Task 5: Verify, deploy, and capture rollout evidence

**Objective:** Ensure the improvement builds locally, ships cleanly to `main`, and appears on the live site.

**Files:**
- Modify: `docs/plans/2026-04-19-blog-edit-repo-connection-ux.md`

**Step 1: Run final local verification**

Run:
- `npx tsx --test packages/bb/src/blog-edit/repo-connection.test.ts`
- `npm run build`

Expected: PASS

**Step 2: Review git diff**

Run: `git diff -- packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts docs/plans/2026-04-19-blog-edit-repo-connection-ux.md`
Expected: only the intended UX and plan changes.

**Step 3: Commit and push**

```bash
git add docs/plans/2026-04-19-blog-edit-repo-connection-ux.md packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts
git commit -m "feat(blog-edit): streamline repo connection"
git push origin main
```

**Step 4: Poll live deployment**

Run a cache-busting fetch against `https://node.xdoes.space/blog-edit?cb=20260419a` and confirm the HTML contains new connection guidance such as `Paste a repo URL or owner/repo` or `Next publish target`.

Example:

```bash
python3 - <<'PY'
import ssl, urllib.request
url = 'https://node.xdoes.space/blog-edit?cb=20260419a'
with urllib.request.urlopen(url, context=ssl.create_default_context(), timeout=20) as r:
    html = r.read().decode('utf-8', 'ignore')
    print('Paste a repo URL or owner/repo' in html)
    print('Next publish target' in html)
PY
```

Expected: `True` for at least one newly added marker after propagation.

**Step 5: Capture proof**

Use browser tools on the live `/blog-edit` page and capture a screenshot once the new UI appears.

---

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
