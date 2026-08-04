# Changelog

All notable changes to this project will be documented here.

The format follows Keep a Changelog, and this project uses Semantic Versioning.

## [Unreleased]

### Changed

- Dashboard readiness notices now disappear as soon as real analytics data is visible, and the waiting state can blur each panel while data is still being collected.
- Pipelines and Runners loading states now fill the full table area and match the Dashboard panel shape during initial loading.
- Update-password flow now uses a modernized card layout with inline validation, mismatch warning, and eye-icon visibility toggles inside the inputs.
- Theme persistence, first-login password handling, and auth bootstrapping were tightened so the default theme and forced password update flow behave consistently.

### Fixed

- Dashboard, Pipelines, and Runners now keep their loading/waiting notices aligned with actual zero-data collection state instead of lingering after data is present.
- Password update UI copy and contrast were improved for better readability across light and dark themes.
- GitLab environment saves now validate the access token up front and show a clear error when the token is invalid or lacks access.

### Documentation

- README and runtime configuration notes were refreshed to match the current dashboard, auth, and analytics workflow.

## [2026-08-04]

### Commits

- Implement GHCR publish workflow, update runtime config docs, and commit dashboard feature changes

## [2026-07-30]

### Commits

- feat: add self-hosted runner monitoring and dashboard preloading
- feat: add runner monitoring and improve pipeline dashboard

## [2026-07-29]

### Commits

- style: align dark theme with Arcane dashboard
- style: align dark theme and screenshots with Arcane dashboard

## [2026-07-28]

### Commits

- feat: enhance pipeline monitoring, downstream visibility, security, and dashboard UI
- docs: expand environment configuration example
- fix: display deploy and cleanup jobs last
- feat: derive pipeline status from active downstream jobs
- fix: keep newest pipeline per branch within history window
- feat: improve dashboard branding and login theme control
- perf: retain dashboard tabs between navigation
- perf: reuse pipeline history cache for latest pipelines

