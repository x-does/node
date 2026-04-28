# Interactive Apps Catalogue Implementation Plan

> **For Hermes:** Implement directly in the existing Next.js app; no subagent required unless verification uncovers regressions.

**Goal:** Replace the placeholder `/interactive-apps` page with a minimalist searchable catalogue of XDOES webapps/tools and update the main menu so Blog editor is accessible through the Interactive page instead of appearing as `Blog editor Soon` on the homepage.

**Architecture:** Keep the page mostly server-rendered for static content and add a tiny client component for search/filtering. Store the catalogue data in one typed module so the menu and page can share routes later if needed. Use existing XDOES shell styling and avoid adding dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS utility classes.

---

## Task 1: Capture current live baseline

**Objective:** Preserve before screenshots and visible copy for comparison.

**Files:**
- Output: `/opt/data/cache/screenshots/xdoes-interactive-before/home-before.png`
- Output: `/opt/data/cache/screenshots/xdoes-interactive-before/interactive-before.png`

**Steps:**
1. Fetch live `/` and `/interactive-apps` with cache-busting query params.
2. Capture Playwright screenshots.
3. Confirm baseline copy includes `Blog editor Soon` on homepage and `Coming soon` on interactive page.

## Task 2: Add catalogue data

**Objective:** Define searchable tool entries in one typed module.

**Files:**
- Create: `src/app/interactive-apps/catalogue.ts`

**Entries:**
- Blog editor: `/blog-edit`, status `live`, tags `blog`, `publishing`, `editor`, `github`, `sqlite`.
- Blog: `/blog`, status `live`, tags `writing`, `posts`, `publishing`.
- XD License: `/xd-license`, status `reference`, tags `license`, `terms`.
- Sponsors: `/sponsors`, status `reference`, tags `sponsors`, `partners`.
- YouTube: external `https://youtube.com/@x-does`, status `external`, tags `video`, `channel`.

## Task 3: Add client-side search component

**Objective:** Provide a minimalist accessible filterable list with no new dependencies.

**Files:**
- Create: `src/app/interactive-apps/interactive-catalogue.tsx`

**Behavior:**
- `useState` search query.
- Filter by title, description, tags, status.
- Show matching count.
- Show empty state if no match.
- Use normal `<a>` links so all apps remain directly accessible.

## Task 4: Replace placeholder interactive page

**Objective:** Render the catalogue page and remove `Coming soon` copy.

**Files:**
- Modify: `src/app/interactive-apps/page.tsx`

**Behavior:**
- Metadata title/description updated.
- Minimal heading: `Interactive`.
- Short body: `Searchable catalogue for XDOES webapps, editors, references, and experiments.`
- Include `<InteractiveCatalogue />`.

## Task 5: Update main menu

**Objective:** Make Interactive/apps a real link and remove Blog editor Soon from main menu.

**Files:**
- Modify: `src/components/main-shell.tsx`

**Changes:**
- `Interactive/apps` gets `href: '/interactive-apps'` and is no longer disabled.
- Remove disabled `Blog editor` menu item entirely.
- Keep `Blog` as a direct public link.

## Task 6: Verify locally

**Objective:** Ensure app builds and UI behaves before pushing.

**Commands:**
```bash
cd /opt/data/home/work/node
npm run build
PORT=4038 npm run start
```

**Checks:**
- `/` no longer contains `Blog editor Soon`.
- `/` links to `/interactive-apps`.
- `/interactive-apps` contains `Blog editor`, `Search tools`, and links to `/blog-edit`.
- Search query `editor` keeps Blog editor visible.

## Task 7: Push and verify live

**Objective:** Deploy and prove the change on node.xdoes.space.

**Commands:**
```bash
git add src/app/interactive-apps src/components/main-shell.tsx docs/plans/2026-04-28-interactive-apps-catalogue.md
git commit -m "feat(site): add interactive apps catalogue"
git push origin main
```

**Live checks:**
- Poll `/interactive-apps?cb=<commit>` until visible markers appear.
- Browser DOM checks for search and link behavior.
- Capture after screenshots for `/` and `/interactive-apps`.
