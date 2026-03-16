# Dependency Audit Summary - 2026-03-16

## Overview
A comprehensive dependency audit was performed across the `simple-cli` repository to ensure the system’s health and security before transitioning to post-Phase 38 maintenance.

## Actions Taken
1. **Node Packages**:
   - Executed `npm audit fix` which updated 29 packages and removed 125 packages.
   - Executed `npm update` to bump non-breaking minor/patch versions.
   - Executed `npm audit fix --force` to remediate critical vulnerabilities (such as `vitest`, `esbuild`, `undici`, `discord.js`, and `yauzl`). Addressed over 30 vulnerabilities.
   - Ran `npm test` successfully post-updates.

2. **Helm Charts**:
   - Upgraded `curl` sidecar image from `8.6.0` to `8.12.1` in `deployment/chart/simple-cli/values.yaml`.
   - Upgraded `rclone` sidecar image from `1.66` to `1.69.1` in `deployment/chart/simple-cli/values.yaml`.
   - Upgraded `redis` image from `7.0-alpine` to `7.4-alpine` in `deployment/chart/simple-cli/values.yaml`.
   - Bumped Chart version to `0.1.2`.

3. **Docker Compose**:
   - Upgraded PostgreSQL from `15-alpine` to `16-alpine`.
   - Upgraded Redis from `6-alpine` to `7-alpine`.

4. **GitHub Actions**:
   - Upgraded `peaceiris/actions-gh-pages@v3` to `v4` in `.github/workflows/deploy-docs.yml`.
   - Confirmed other actions (checkout, setup-node) were already using `v4` (latest stable).

## Next Steps
- Continue with Post-Phase 38 tasks, focusing on performance tuning of LanceDB vector search.