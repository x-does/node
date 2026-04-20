# Blog bootstrap + visibility fix Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make `node.xdoes.space/blog` reliably show posts from `x-does/blog` in production, while keeping blog-editor bootstrap behavior graceful when `blog.sqlite` does not exist yet.

**Architecture:** Keep the editor’s GitHub-first publish flow, but treat missing `blog.sqlite` as a normal bootstrap case. On the public blog side, stop depending on a sibling local checkout of `x-does/blog`; instead, use local sqlite when explicitly available and otherwise fetch the sqlite index from GitHub via server credentials, cache it in a temp file, and query it normally.

**Tech Stack:** Next.js app router, TypeScript, `better-sqlite3`, GitHub Contents API, Hostinger auto-deploy from `main`.

---

## Confirmed root cause

1. The editor’s first-publish failure was caused by `GET /repos/x-does/blog/contents/blog.sqlite?ref=main` returning 404 and the client helper throwing before fallback DB creation could run.
2. That editor-side bootstrap fix is already deployed live.
3. The remaining `/blog` visibility failure is caused by server-side code reading only a guessed local path (`../blog/blog.sqlite`).
4. On the production app host, that sibling checkout does not exist, so `/blog` returns zero posts even though the GitHub repo contains a valid `blog.sqlite` with the new post.

---

### Task 1: Finish the server-side loader design

**Objective:** Define a production-safe source-of-truth order for the blog sqlite index.

**Files:**
- Modify: `src/lib/main-blog-db.ts`
- Modify: `packages/bb/src/lib/main-blog-db.ts`

**Step 1:** Prefer `BLOG_SQLITE_PATH` when explicitly configured.

**Step 2:** Allow a small set of local fallback paths only for environments that actually have a sibling checkout.

**Step 3:** If no local file exists, fetch `blog.sqlite` from the GitHub Contents API using `GITHUB_PAT` or `GITHUB_TOKEN`.

**Step 4:** Decode the base64 payload to a temp sqlite file and reuse that file by content SHA.

**Step 5:** Return an empty list only when neither local nor remote source exists.

**Verification:**
- Loader behavior is deterministic and does not silently depend on undeclared filesystem layout.

### Task 2: Make blog consumers async-safe

**Objective:** Update all server consumers to await the new loader.

**Files:**
- Modify: `src/app/api/main-blog/posts/route.ts`
- Modify: `packages/bb/src/blog/page.tsx`

**Step 1:** Change API route to await `loadMainBlogPosts(...)`.

**Step 2:** Change packaged blog page to await `loadMainBlogPosts(...)`.

**Step 3:** Confirm no remaining synchronous call sites exist.

**Verification:**
- Search shows all `loadMainBlogPosts` consumers are async-compatible.

### Task 3: Add regression coverage for remote sqlite loading

**Objective:** Prevent future regressions where production silently returns zero posts because no local checkout exists.

**Files:**
- Create: `packages/bb/src/lib/main-blog-db.test.ts`
- Optional create: `src/lib/main-blog-db.test.ts` if the app-side copy needs direct coverage too

**Step 1: Write failing test**
- Mock missing local files.
- Mock GitHub API success with base64 sqlite bytes.
- Assert posts load from the remote sqlite source.

**Step 2: Run targeted test to verify failure**
- Use `tsx --test` for the new test file.

**Step 3: Write minimal implementation support**
- If mocking is hard, extract tiny helpers for candidate path selection / response decoding.

**Step 4: Run tests to verify pass**
- Include existing `github-api.test.ts` and `repo-connection.test.ts`.

**Verification:**
- Regression tests pass and prove remote fallback works.

### Task 4: Validate with the real repo contents locally

**Objective:** Prove the new loader can read the actual `x-does/blog` sqlite index that contains the user’s test post.

**Files:**
- No permanent file changes required.

**Step 1:** Source `/opt/data/home/creds.env`.

**Step 2:** Run a local script against `loadMainBlogPosts()` with no local sqlite file present.

**Step 3:** Assert the returned rows include the known test post from `x-does/blog`.

**Verification:**
- Local script prints count >= 1 and includes slug/title for the test post.

### Task 5: Push and verify Hostinger propagation

**Objective:** Deploy the fix to `main` and prove the live site now shows posts.

**Files:**
- Modify only implementation files from earlier tasks.

**Step 1:** Check `git status --short --branch`.

**Step 2:** Run targeted tests.

**Step 3:** Commit with a focused message like `fix(blog): load sqlite index from github when local repo is absent`.

**Step 4:** Push to `main`.

**Step 5:** Poll live `/api/main-blog/posts?cb=<cachebuster>` until `count` is non-zero.

**Step 6:** Open live `/blog?cb=<cachebuster>` and confirm the test post is visible.

**Step 7:** Capture screenshot proof.

**Verification:**
- Live API returns posts.
- Live `/blog` renders the post.
- Screenshot path captured.

### Task 6: Re-check editor UX after deploy

**Objective:** Confirm the user-reported 404 no longer breaks the editor flow and is at most an expected bootstrap fetch in DevTools.

**Files:**
- No permanent file changes unless a remaining UX issue is found.

**Step 1:** Open `/blog-edit` in the browser.

**Step 2:** Confirm the deployed bundle still includes bootstrap strings and repo-target UI.

**Step 3:** If needed, verify the page messaging clarifies automatic sqlite creation.

**Verification:**
- Editor remains functional and does not surface bootstrap absence as a fatal publish blocker.

---

## Commands to use

```bash
cd /opt/data/home/work/node
npm exec -- tsx --test packages/bb/src/blog-edit/repo-connection.test.ts packages/bb/src/blog-edit/github-api.test.ts packages/bb/src/lib/main-blog-db.test.ts
```

```bash
cd /opt/data/home/work/node
git status --short --branch
git add src/lib/main-blog-db.ts packages/bb/src/lib/main-blog-db.ts src/app/api/main-blog/posts/route.ts packages/bb/src/blog/page.tsx packages/bb/src/lib/main-blog-db.test.ts docs/plans/2026-04-20-blog-bootstrap-visibility-fix.md
git commit -m "fix(blog): load sqlite index from github when local repo is absent"
git push origin main
```

---

## Success criteria

- Missing `blog.sqlite` is treated as bootstrap in the editor.
- `/blog` does not require a sibling local checkout in production.
- Live `/api/main-blog/posts` returns the published test post.
- Live `/blog` visibly renders that post.
- Screenshot proof is captured after propagation.
