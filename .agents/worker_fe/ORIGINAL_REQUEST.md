## 2026-08-06T18:33:03Z
Task: Implement Milestone 4 - Frontend Virtualization, Terminal Aesthetics UI/UX & Refactoring.

Requirements:
1. `frontend/src/index.css`:
   - Add missing CSS root variables: `--bg-panel` (`#0c0d10`), `--color-warning` (`#ffaa00`), `--color-red` (`#ff0055`), `--color-magenta` (`#ff00ff`), `--color-cyan` (`#00f0ff`), `--color-green` (`#00ff66`), `--font-mono` (`Roboto Mono`, monospace).
   - Ensure dark terminal theme styling is applied globally (black `#000000` / `#060608` background, neon borders, crisp monospace typography).
2. Shared Utility & Component Extraction:
   - Create `src/utils/slugify.js`: consolidate `slugifyBroker` duplicated across 5 files into a single export.
   - Create `src/components/ImageWithFallback.jsx`: consolidate logo image fallback error handling into a reusable component.
3. Refactor `ResearchReports.jsx` (645 lines) into modular sub-components:
   - `src/components/ReportStats.jsx`: analytical stats & Recharts distribution chart (target potential distribution, broker breakdown).
   - `src/components/ReportFilters.jsx`: filter bar (search, rating filter AL/TUT/SAT, broker filter, min potential filter, reset).
   - `src/components/ReportTable.jsx` & `ReportRow.jsx`: report table view with inline target price, upside badge, broker logo, PDF view link.
   - `src/components/ReportPagination.jsx`: clean page navigation controls.
4. Implement Table Pagination / Virtualization in `Screener.jsx`:
   - Add pagination / windowing to `Screener.jsx` to eliminate rendering 300+ stock rows simultaneously into DOM.
5. Fix Lint Warnings & Build:
   - Fix all 7 oxlint warnings (unused catch variables `e`, unused state, `useEffect` missing dependencies in `StockDetail.jsx`, `Home.jsx`, `Stocks.jsx`, `ResearchReports.jsx`).
   - Run `npm run build` and `npm run lint`. Ensure build succeeds cleanly without errors or warnings.
6. Documentation & Handoff:
   - Write `changes_fe.md` and `handoff.md` in your working directory.
   - Send a completion message to parent orchestrator.
