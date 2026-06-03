---
name: starlight-ui-overrides
description: Use when changing Starlight UI styling in this repo, especially mobile table of contents, sidebar, header, dark mode, responsive dropdowns, customCss, scoped Astro styles, or verifying generated Astro CSS.
license: MIT
metadata:
  author: Damien BECHERINI's AI
  version: "1.0.0"
  category: frontend
  tags: starlight, astro, css, ui-overrides, dark-mode, mobile-toc, custom-css
---

# Starlight UI Overrides

Use this before changing Starlight chrome in this repo: mobile table of contents, sidebars, header, dark mode surfaces, responsive dropdowns, or any CSS override targeting generated Starlight markup.

## Core Rule

Verify against rendered output, not just source files. Starlight components use virtual imports and Astro-scoped classes, so a source-level CSS change can look correct but never affect the generated page.

## Workflow

1. Locate the repo override first:
   - `src/components/PageSidebar.astro` renders `MobileTableOfContents` and `TableOfContents`.
   - `config/starlight/index.mjs` registers Starlight `customCss` and component overrides.
   - `src/components/Head.astro` injects head-level project behavior.
2. Inspect the real DOM from a served page or `dist/**/*.html`.
   - Expect generated classes such as `nav.astro-*`.
   - Prefer stable IDs/classes from Starlight when available.
3. For Starlight components rendered inside project overrides, prefer colocated Astro styles with `:global(...)` when the selector targets child markup from a virtual Starlight component.
4. Keep selectors scoped by behavior and theme. For the mobile TOC dark dropdown, target:

```css
:global(:root[data-theme='dark'] #starlight__mobile-toc[open] .dropdown) {
    /* dark-mode dropdown surface */
}
```

5. Use `customCss` for broad site CSS, but do not assume a new file is included until a build proves it appears in `dist/_astro/*.css`.
6. Add a small guard test when the selector or visual behavior is fragile.

## Mobile TOC Dark Dropdown Pattern

Use this pattern for a dark, readable floating dropdown surface:

```css
:global(:root[data-theme='dark'] #starlight__mobile-toc[open] .dropdown) {
    border-color: color-mix(in srgb, var(--sl-color-gray-4) 62%, transparent);
    border-top-color: color-mix(in srgb, var(--sl-color-gray-3) 52%, transparent);
    background-color: rgba(8, 13, 24, 0.88);
    background-color: color-mix(in srgb, var(--sl-color-black) 86%, transparent);
    box-shadow:
        0 1rem 2.75rem rgba(0, 0, 0, 0.72),
        0 0 0 1px rgba(255, 255, 255, 0.07),
        0 0 2rem rgba(80, 110, 170, 0.18);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
}
```

Add a fallback:

```css
@supports not (backdrop-filter: blur(1px)) {
    :global(:root[data-theme='dark'] #starlight__mobile-toc[open] .dropdown) {
        background-color: var(--sl-color-black);
    }
}
```

## Verification

Run targeted tests first, then build:

```powershell
node --test tests/starlight-mobile-toc-style.test.mjs
npm run build
```

Confirm the generated CSS contains the rule:

```powershell
python -c "from pathlib import Path
for p in Path('dist/_astro').glob('*.css'):
    s=p.read_text(encoding='utf-8', errors='replace')
    hits=[x for x in ['starlight__mobile-toc','backdrop-filter','right-sidebar-panel'] if x in s]
    if hits: print(p, hits)"
```

If `rg` misses minified CSS in `dist`, use the Python string search above.

## Common Mistakes

- Styling `.dropdown` without scoping to `#starlight__mobile-toc` can affect unrelated dropdowns.
- Styling generated `.astro-*` classes is brittle; use stable IDs/classes when possible.
- Adding a `customCss` file and only testing source presence is insufficient.
- Forgetting `:global(...)` inside an Astro component style means selectors may not reach child markup from virtual Starlight components.
- Checking only dev server behavior can miss whether the production bundle contains the rule.
