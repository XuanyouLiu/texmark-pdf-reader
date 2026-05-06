# Changelog

## [1.5.9] - 2026-05-06

- Rebranded the extension as TeXMark PDF Reader.
- Added dirty-state and Auto Save support for PDF annotation edits.
- Added single page and two page default layout settings.
- Added reverse SyncTeX from PDF clicks back to LaTeX source.
- Tuned initial render settings and refreshed the viewer UI.

## [1.5.8] - 2026-03-29

- Added SDK preview options for per-preview config and initial view state.
- Added support for opening API previews at a specific initial page.
- Reduced view-state persistence work during scroll.
- Fixed Blob creation for injected PDF data to avoid extra bytes and memory waste.
- Removed outdated save and viewer hooks, and trimmed project docs.

## [1.5.7] - 2026-03-29

- Reduced restore-time view-state churn.
- Moved viewer runtime and persistence logic into separate modules.

## [1.5.6] - 2026-03-29

- Updated Bun dependencies and build tooling.
- Fixed VSIX packaging by aligning `@types/vscode` with `engines.vscode`.
- Added `references/vscode-pdf` submodule and related docs.

## [1.5.5] - 2026-01-17

- Fixed broken reload after VS Code restart caused by expired webview URIs.
- Added page/view-state restoration after restart.
- Cached the HTML template to reduce file I/O.
- Unified save logic and reduced view-state serialization churn.
- Centralized webview options.
- Removed unused constants and imports.
