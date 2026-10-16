# Release Version and Changelog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current release SemVer/date in the application menu and expose the five latest `CHANGELOG.md` entries through a “Novidades” dialog without changing PWA build-update behavior.

**Architecture:** Read the root package version and release dates from the repository changelog at Vite build time. Expose SemVer/release date separately from the existing commit SHA, which remains the deployed build identity in `version.json`; render changelog entries in a separate user-opened modal from the automatic update prompt.

**Tech Stack:** Node.js ESM, React 19, Vite 8, Cypress, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-16-feedback-e-changelog-design.md` (section 2)

## Global Constraints

- `package.json` at repository root is the source of the displayed SemVer.
- The displayed date is the civil release date in `CHANGELOG.md`, formatted `dd/mm/yyyy`.
- Keep the Git SHA as the PWA build identifier in `version.json`; do not compare release SemVer to build SHA.
- The current root version `1.0.0` must be reconciled to the documented latest release `2.0.0` dated `2026-10-15`; do not invent another release.
- Read the existing changelog; do not introduce a parallel hardcoded release history or a general Markdown dependency.
- Preserve the automatic PWA update dialog and its service-worker behavior.

## Review Focus

- Two builds of the same release have different commit SHAs: the PWA guard must still detect and update between them.
- Changelog has fewer than five releases: render all available entries without an empty placeholder.
- The root package version has no exact changelog heading: fail the Vite build with a useful error rather than show an invented date.
- Release dates are parsed as civil `YYYY-MM-DD` dates: format reliably as `dd/mm/yyyy` without timezone day shifts.
- “Novidades” is opened from either menu variant: it must remain keyboard-accessible and must not trigger the automatic update modal.

---

### Task 1: Release Metadata and Changelog Parser

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `front-end/vite.config.js`
- Modify: `front-end/src/services/appVersion.js`
- Create: `front-end/src/services/changelog.js`
- Test: `front-end/tests/appVersion.test.js`
- Test: `front-end/tests/changelog.test.js`

**Interfaces:**
- Consumes: root `package.json`, root `CHANGELOG.md`, existing Git SHA resolution.
- Produces: `APP_VERSION` (SemVer string), `APP_RELEASE_DATE` (`YYYY-MM-DD`), `APP_BUILD_ID` (Git SHA); `parseChangelog(markdown) -> [{ version, date, notes }]`; `fetchPublishedBuildId(fetchImpl) -> Promise<string>`.

- [ ] **Step 1: Add failing Node tests** for parsing dated release headings and notes, returning at most five newest entries, rejecting malformed/missing release dates, and keeping the published build-ID fetch independent of release metadata.
- [ ] **Step 2: Run `node --test front-end/tests/changelog.test.js front-end/tests/appVersion.test.js`** and verify the new parser/build-ID assertions fail before implementation.
- [ ] **Step 3: Implement `parseChangelog(markdown)`** in `changelog.js`; recognize only `## [X.Y.Z] - YYYY-MM-DD` release headings, associate following notes with that release, and preserve the date string as a civil date.
- [ ] **Step 4: Set the root package and lockfile root-package versions to `2.0.0`** to match the latest documented release dated `2026-10-15`; do not change the frontend package's independent private version.
- [ ] **Step 5: Update Vite configuration** to inject `VITE_APP_VERSION`, `VITE_APP_RELEASE_DATE`, and `VITE_APP_CHANGELOG` from package/changelog data, fail with an actionable error if the active version has no valid changelog entry, and continue emitting `version.json` with its existing SHA in `version`.
- [ ] **Step 6: Export `APP_BUILD_ID` separately** in `appVersion.js`; rename the fetch helper to `fetchPublishedBuildId()` and update its tests while retaining no-store network behavior and timeout/errors.
- [ ] **Step 7: Run the focused Node tests and `npm --prefix front-end run build`; verify `dist/version.json` still contains the Git SHA and the built bundle contains release SemVer separately.**
- [ ] **Step 8: Commit** version-source reconciliation and build metadata.

### Task 2: Preserve PWA Update and Telemetry Build Identity

**Files:**
- Modify: `front-end/src/App.jsx`
- Modify: `front-end/src/components/NovidadesModal.jsx`
- Modify: `front-end/src/services/sentry.js`
- Test: `front-end/tests/appVersion.test.js`
- Test: existing `front-end/tests/e2e/dashboard_pwa.cy.js` and new `front-end/tests/e2e/app_version.cy.js`

**Interfaces:**
- Consumes: `APP_VERSION`, `APP_BUILD_ID`, and `fetchPublishedBuildId()` from Task 1.
- Produces: PWA guard compares the published `version.json.version` to `APP_BUILD_ID`; Sentry release metadata uses the actual deployed build identifier, while user-facing release copy uses SemVer.

- [ ] **Step 1: Add a regression test** proving a published SHA that differs from the current SHA triggers the update path even when `APP_VERSION` is unchanged, and equal SHAs do not trigger it.
- [ ] **Step 2: Run the focused test** and verify it catches comparisons against the old overloaded `APP_VERSION`.
- [ ] **Step 3: Change `App.jsx`** to compare published build ID with `APP_BUILD_ID`; retain current retry interval, service-worker update flow, and once-per-session behavior.
- [ ] **Step 4: Update `NovidadesModal.jsx` and Sentry release metadata** to use the appropriate identifier without changing automatic-update decisions.
- [ ] **Step 5: Run app-version unit/E2E tests and lint the three modified modules.**
- [ ] **Step 6: Commit** PWA build-identity separation.

### Task 3: Footer Release Stamp and Changelog Dialog

**Files:**
- Modify: `front-end/src/components/Layout.jsx`
- Create: `front-end/src/components/ChangelogModal.jsx`
- Modify: `front-end/src/services/changelog.js`
- Test: `front-end/tests/layout.test.js`
- Test: `front-end/tests/e2e/layout_rendering.cy.js`, `front-end/tests/e2e/menu_navegacao.cy.js`, and new `front-end/tests/e2e/app_version.cy.js`

**Interfaces:**
- Consumes: `APP_VERSION`, `APP_RELEASE_DATE`, and parsed `CHANGELOG_RELEASES` from Task 1.
- Produces: menu footer text `Sabor de Abraço · vX.Y.Z · dd/mm/yyyy`; desktop/mobile “Novidades” control; accessible changelog dialog showing up to five release entries. The dialog is distinct from `NovidadesModal`.

- [ ] **Step 1: Add failing layout/E2E coverage** for exact footer release stamp, opening “Novidades” from desktop/mobile navigation, rendering version/date/notes, and closing by button/Escape.
- [ ] **Step 2: Run the focused layout and Cypress specs** and verify the current footer/modal do not satisfy the requirements.
- [ ] **Step 3: Format `APP_RELEASE_DATE` as `dd/mm/yyyy` without converting through a timezone-sensitive timestamp** and render the exact release stamp in `Layout.jsx`.
- [ ] **Step 4: Implement `ChangelogModal.jsx`** as an accessible dialog with labelled heading, focus management, Escape/close button, and the five latest release entries from injected changelog data.
- [ ] **Step 5: Add a “Novidades” button/link** to both desktop and mobile menu surfaces; opening it must not change or reuse the automatic update prompt state.
- [ ] **Step 6: Run focused layout/changelog tests, lint, and production build.**
- [ ] **Step 7: Commit** the release footer and changelog dialog.

### Task 4: End-to-End Version and Release Regression

**Files:**
- Modify: `front-end/tests/appVersion.test.js`
- Modify: `front-end/tests/e2e/app_version.cy.js`
- Modify: `front-end/tests/layout.test.js` as needed
- Inspect: `front-end/dist/version.json` after build (generated; do not commit build output)

**Interfaces:**
- Consumes: release metadata, PWA build identity, and changelog UI from Tasks 1–3.
- Produces: evidence that users see the current release while the PWA still detects SHA changes and both menu variants expose the same five-release history.

- [ ] **Step 1: Add test coverage** for exact active release `2.0.0` / `2026-10-15`, missing/malformed changelog entry build failure, and a SHA-only build update.
- [ ] **Step 2: Run `node --test front-end/tests/changelog.test.js front-end/tests/appVersion.test.js front-end/tests/layout.test.js` and the focused app-version Cypress spec.**
- [ ] **Step 3: Run `npm --prefix front-end run build` and inspect generated `dist/version.json`; assert its `version` value remains the build SHA, not `2.0.0`.**
- [ ] **Step 4: Run focused frontend lint and `git diff --check`; confirm no generated `dist/` artifacts are staged.**
- [ ] **Step 5: Commit** final release/changelog regression coverage.
