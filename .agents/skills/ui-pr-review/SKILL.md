---
name: ui-pr-review
description: Visual presentation and frontend bundle optimization checks.
triggers:
  - "reviewing tsx or JSX file changes"
---

# UI PR Review Guidelines

## React Rendering

- Audit `useEffect` dependency arrays — missing or over-specified dependencies cause stale closures or infinite re-render loops.
- Confirm expensive computations are wrapped in `useMemo` and stable callbacks in `useCallback`.
- Verify component keys in lists are stable, unique, and not array indices.

## Vite & Bundle

- Confirm heavy dependencies (e.g., `jspdf`, `html2canvas`, `recharts`) are lazily imported via `React.lazy` / dynamic `import()` where they are not needed on initial render.
- Check that Vite's `terser` minifier config is not accidentally disabled in production builds.
- Avoid importing entire libraries when only specific named exports are used (tree-shaking safety).

## React Router DOM

- Ensure route components use `lazy` loading for code-splitting at the route level.
- Confirm navigation guards and redirects handle unauthenticated states correctly.

## CodeMirror

- Validate that `@uiw/react-codemirror` extensions (e.g., `@codemirror/lang-sql`, `@codemirror/theme-one-dark`) are memoised to prevent editor re-initialisation on every render.
- Confirm `onChange` handlers are debounced when triggering expensive downstream operations.

## Recharts

- Verify `ResponsiveContainer` is used for all chart components to avoid fixed-dimension layout breaks.
- Confirm large datasets passed to charts are memoised to prevent unnecessary redraws.

## react-markdown

- Ensure `rehype-highlight` and `remark-gfm` plugins are passed as stable references (defined outside the render function) to avoid repeated plugin instantiation.
- Sanitise any user-supplied markdown content before rendering to prevent XSS.

## html2canvas & jspdf

- Confirm these are only invoked in response to explicit user actions (not on render).
- Verify async export handlers display loading state and handle errors gracefully.

## Lucide React

- Import only named icon components, never the full library index.
- Confirm icon sizes and `aria-label` attributes are set for accessibility.
