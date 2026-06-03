# Starlight Sidebar Virtual Imports Plan

**Goal:** Document and finish the uncommitted Starlight sidebar/UI override work, including the direct component import fix, mobile TOC styling guard, and related agent skills.

**Scope:** `starlight-obsidian-engine` only.

---

## Context

`src/components/PageSidebar.astro` originally imported Starlight layout subcomponents through:

```astro
import MobileTableOfContents from 'virtual:starlight/components/MobileTableOfContents';
import TableOfContents from 'virtual:starlight/components/TableOfContents';
```

Those virtual modules are resolved by Starlight's Vite integration at runtime/build time. Their TypeScript declarations are present in Starlight's internal `virtual-internal.d.ts`, but this project does not reference that internal declaration file from its own type environment. As a result, the editor reports:

```text
Cannot find module 'virtual:starlight/components/MobileTableOfContents' or its corresponding type declarations.
```

The pragmatic fix is to import the default Starlight components from the published component entrypoints:

```astro
import MobileTableOfContents from '@astrojs/starlight/components/MobileTableOfContents.astro';
import TableOfContents from '@astrojs/starlight/components/TableOfContents.astro';
```

This matches the existing project pattern used by `src/components/Head.astro` and `src/components/Footer.astro`.

---

## Decision

Use direct `@astrojs/starlight/components/*.astro` imports for `PageSidebar.astro`.

This is the right trade-off for the current project because:

- The project does not currently override `TableOfContents` or `MobileTableOfContents`.
- The direct imports are exported by Starlight and understood by TypeScript.
- The change removes an editor/type error without introducing a local declaration for Starlight internals.
- The behavior remains equivalent for the current configuration.

The trade-off is that future overrides of `TableOfContents` or `MobileTableOfContents` would not be picked up automatically by `PageSidebar.astro`. If that future requirement appears, switch back to `virtual:starlight/components/*` and add an explicit local type reference/declaration for Starlight virtual modules.

---

## Files

- Modify `src/components/PageSidebar.astro`
  - Use direct Starlight component imports.
  - Keep the existing backlinks sidebar integration.
  - Keep the mobile TOC dark dropdown style.
- Create `tests/starlight-mobile-toc-style.test.mjs`
  - Guard the fragile mobile TOC dropdown selectors and visual properties.
- Create `.agents/skills/starlight-ui-overrides/SKILL.md`
  - Capture project-specific guidance for Starlight UI overrides, scoped Astro styles, and production CSS checks.
- Modify `.agents/skills/astro-mermaid/SKILL.md`
  - Normalize the skill author metadata.
- Create `docs/plans/2026_06_03_20-16_main_starlight-sidebar-virtual-imports.plan.md`
  - Preserve the decision record and implementation report.
- Modify `docs/plans/README.md`
  - Add this plan to the engine plan index.

---

## Tasks

- [x] Explain why the `virtual:starlight/components/*` imports triggered the TypeScript module error.
- [x] Replace `PageSidebar.astro` virtual imports with direct `@astrojs/starlight/components/*.astro` imports.
- [x] Preserve the existing sidebar/backlinks behavior.
- [x] Preserve the mobile TOC dark dropdown style override.
- [x] Add a focused Node test that checks the fragile mobile TOC selector and key visual properties.
- [x] Add a `starlight-ui-overrides` agent skill for future Starlight chrome and CSS work.
- [x] Keep the Mermaid skill metadata consistent with the local skill author convention.
- [x] Run targeted validation where available.
- [x] Append a simulated implementation/build report to this plan.
- [x] Commit the relevant source, test, skill, and plan changes.

---

## Validation Plan

- Run linter diagnostics for `src/components/PageSidebar.astro`.
- Run the focused test:

```powershell
node --test tests/starlight-mobile-toc-style.test.mjs
```

- Prefer a full production build when not simulating:

```powershell
npm run build
```

- If full type checking is needed, install the missing optional tooling first:

```powershell
npm i -D @astrojs/check typescript
npx astro check
```

---

## Implementation/build report

### Changes

- Updated `src/components/PageSidebar.astro` to import `MobileTableOfContents` and `TableOfContents` through Starlight's published component entrypoints instead of internal virtual module IDs.
- Kept the mobile TOC dark dropdown CSS override in the sidebar component, including `:global(...)` scoping and the non-`backdrop-filter` fallback.
- Added `tests/starlight-mobile-toc-style.test.mjs` as a focused guard for the mobile TOC dark dropdown selector and key visual CSS properties.
- Added `.agents/skills/starlight-ui-overrides/SKILL.md` to document how to safely change Starlight chrome, scoped Astro styles, generated CSS, and mobile TOC surfaces in this repo.
- Updated `.agents/skills/astro-mermaid/SKILL.md` author metadata from `debug-session` to `Damien BECHERINI's AI`.
- Added this plan and indexed it in `docs/plans/README.md`.

### Validation evidence

- `ReadLints` on `src/components/PageSidebar.astro`: no linter errors.
- `node --test tests/starlight-mobile-toc-style.test.mjs`: 1 test, 1 pass.
- `npx astro check`: not completed because Astro prompted to install missing optional dependencies `@astrojs/check` and `typescript`.
- `npx tsc --noEmit`: not available because `typescript` is not installed locally.

### Simulated build result

The full production build was intentionally simulated for this report rather than executed. Expected result for this change set:

- Starlight resolves the direct `@astrojs/starlight/components/*.astro` imports without the previous virtual-module TypeScript diagnostic.
- The rendered sidebar still includes the default mobile and desktop table of contents components.
- The mobile TOC dark dropdown CSS remains present in the component source and should be emitted into the production CSS bundle.
- No generated `dist/` or `.astro/` artifacts are part of the intended commit.

### Limitations

- The direct import approach will not automatically honor future Starlight overrides of `TableOfContents` or `MobileTableOfContents`.
- A real `npm run build` should still be run before release if this branch is used for deployment.
- Full Astro type checking requires adding `@astrojs/check` and `typescript` to the project.
