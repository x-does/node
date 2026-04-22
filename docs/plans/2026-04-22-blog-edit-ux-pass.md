# Blog Editor UX Pass Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Streamline the `/blog-edit` workspace flow so repo selection, editor actions, and feedback are easier to understand while adding polished fixed-corner toasts for key actions.

**Architecture:** Keep the change scoped to `packages/bb/src/blog-edit` by tightening the existing top-of-page workspace summary, reducing duplicate action buttons, and extracting small copy/helper logic for clearer state-driven UI text. Preserve current GitHub auth and publish plumbing, only touching behavior where needed for better create/update/delete UX.

**Tech Stack:** Next.js app router client component, React hooks, TypeScript, Tailwind utility classes, node:test via `tsx --test`.

---

### Task 1: Tighten workspace summary and action hierarchy

**Objective:** Make repo selection and workspace status easier to scan without adding new architecture.

**Files:**
- Modify: `packages/bb/src/blog-edit/page.tsx`
- Modify: `packages/bb/src/blog-edit/repo-connection.ts`
- Test: `packages/bb/src/blog-edit/repo-connection.test.ts`

**Step 1: Write/update failing tests**
- Add tests for any new repo-workflow helper copy/state used to support the simplified workspace card.

**Step 2: Run test to verify behavior**
- Run: `npm exec -- tsx --test packages/bb/src/blog-edit/repo-connection.test.ts -v`

**Step 3: Write minimal implementation**
- Consolidate duplicate repo-target copy/panels into a more cohesive workspace card and simplify button layout.
- Keep settings as advanced-only controls.

**Step 4: Run tests to verify pass**
- Run: `npm exec -- tsx --test packages/bb/src/blog-edit/repo-connection.test.ts -v`

**Step 5: Commit**
- `git add packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/repo-connection.ts packages/bb/src/blog-edit/repo-connection.test.ts`
- `git commit -m "improve(blog-edit): streamline workspace and feedback ux"`

### Task 2: Make create/update/delete feedback polished and accurate

**Objective:** Ensure toast notifications and destructive actions have clear wording and a safe flow.

**Files:**
- Modify: `packages/bb/src/blog-edit/page.tsx`
- Modify: `packages/bb/src/blog-edit/post-management.ts`
- Test: `packages/bb/src/blog-edit/post-management.test.ts`

**Step 1: Write/update failing tests**
- Add/update tests for helper copy that distinguishes create/update/delete wording.

**Step 2: Run test to verify behavior**
- Run: `npm exec -- tsx --test packages/bb/src/blog-edit/post-management.test.ts -v`

**Step 3: Write minimal implementation**
- Use the existing toast stack as the primary feedback channel and demote the old status line.
- Keep delete available from Posts with confirmation and success/error toast wording.

**Step 4: Run tests to verify pass**
- Run: `npm exec -- tsx --test packages/bb/src/blog-edit/post-management.test.ts -v`

**Step 5: Commit**
- `git add packages/bb/src/blog-edit/page.tsx packages/bb/src/blog-edit/post-management.ts packages/bb/src/blog-edit/post-management.test.ts`
- `git commit -m "improve(blog-edit): clarify action toasts and post management flow"`
