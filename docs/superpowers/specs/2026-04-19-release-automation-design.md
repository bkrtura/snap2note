# Release Automation Design

Date: 2026-04-19
Project: Snap2Note
Scope: Reliable version bumping and GitHub release automation for Obsidian plugin distribution

## Context

The repository currently builds the plugin locally, but its release process is incomplete and error-prone. In particular:

- `package.json` references a missing `version-bump.mjs`
- repository metadata drifted from the published Git tag and GitHub Release
- release assets are not guaranteed to be rebuilt from the tagged commit
- the submission process for the Obsidian community plugin directory is sensitive to mismatches between `manifest.json`, GitHub Releases, and PR metadata

The goal of this design is to create a small, predictable release workflow that keeps version metadata, build artifacts, and GitHub Releases aligned.

## Goals

- Use one local command flow to synchronize version numbers across release files
- Make tagged releases publish the required Obsidian assets automatically
- Prevent mismatched versions between the Git tag and repository metadata
- Keep the workflow lightweight and understandable for a small plugin repository
- Document the release process clearly enough that future releases are routine

## Non-Goals

- Automatic changelog generation
- Publishing to npm
- Creating releases from pull requests or arbitrary branch pushes
- A multi-environment deployment pipeline
- Retroactively repairing historical releases beyond allowing manual re-runs on a chosen tag

## Recommended Approach

Use `package.json` as the canonical version source during local release preparation, then use a tag-triggered GitHub Actions workflow to build and publish the release assets.

This approach splits responsibility cleanly:

- local workflow updates version metadata and creates the tagged commit
- GitHub Actions verifies the tag/version match, rebuilds artifacts from source, and publishes the release assets

This minimizes manual steps while preserving a simple mental model.

## Local Versioning Workflow

### Version Source

`package.json` is the source of truth for the version while preparing a release locally.

### Local Release Steps

The intended release flow is:

1. Update the version in `package.json` with `npm version <x.y.z> --no-git-tag-version`
2. Let npm's `version` lifecycle run the synchronization script automatically
3. Review the resulting version changes
4. Commit the release preparation changes
5. Create and push a Git tag matching the version exactly, for example `1.0.1`
6. Let GitHub Actions build and publish the release assets

`npm run version` remains available as a manual resynchronization command when a developer edits version metadata directly and wants to reapply the same synchronization logic without bumping the version again.

### Version Synchronization Script

A new `version-bump.mjs` script will:

- read the version from `package.json`
- update `manifest.json` `version`
- update the root package version in `package-lock.json`
- rewrite `versions.json` so it contains the current plugin version mapped to the existing minimum Obsidian version

The script will not attempt to infer or change `minAppVersion`. It will preserve the current compatibility floor unless explicitly changed by a developer.

## GitHub Release Automation

### Trigger

The release workflow will run on pushes of tags that look like semantic versions without a `v` prefix, such as `1.0.1`.

Using the plain version string keeps the tag format identical to `manifest.json` and avoids translation between `v1.0.1` and `1.0.1`.

### Workflow Responsibilities

The GitHub Actions workflow will:

1. Check out the tagged commit
2. Install dependencies with `npm ci`
3. Build the plugin with `npm run build`
4. Read the current tag name
5. Verify that the tag matches the versions in `package.json` and `manifest.json`
6. Verify that `main.js`, `manifest.json`, and `styles.css` exist after the build
7. Create or update the GitHub Release for that tag
8. Upload `main.js`, `manifest.json`, and `styles.css` as release assets

### Create-or-Update Behavior

The workflow should support updating an existing release for the same tag instead of assuming the release does not exist yet.

This is important for small repositories where a release may already exist but need corrected assets or metadata. Supporting updates reduces the need for manual GitHub UI repairs.

## Failure Protection

### Version Guard

If the tag does not exactly match `package.json` or `manifest.json`, the workflow must fail before publishing.

This prevents releases such as:

- tag `1.0.1` with `manifest.json` still at `1.0.0`
- repository metadata showing one version while GitHub Release shows another

### Build Guard

Release publishing happens only after a successful fresh build from the tagged commit.

This ensures uploaded assets are derived from the tagged source rather than from stale local files.

### Asset Guard

The workflow must replace existing release assets of the same name when republishing for a tag, rather than leaving duplicate or stale files attached to the release.

## Repository Changes

The implementation should add or update the following files:

- `version-bump.mjs`
- `scripts/validate-release.mjs`
- `tests/version-bump.test.mjs`
- `tests/validate-release.test.mjs`
- `.github/workflows/release.yml`
- `package.json`
- `README.md`
- `RELEASING.md`

### `version-bump.mjs`

Responsibilities:

- read and validate the version from `package.json`
- update `manifest.json`
- update the root package version in `package-lock.json`
- rewrite `versions.json`
- exit with a clear error if required files are missing or malformed

### `.github/workflows/release.yml`

Responsibilities:

- run on matching tag pushes
- install dependencies
- build the plugin
- verify version/tag consistency
- create or update the GitHub Release
- upload required release assets

### `scripts/validate-release.mjs`

Responsibilities:

- validate the pushed tag format
- verify that `package.json` and `manifest.json` versions match the tag
- verify that `main.js`, `manifest.json`, and `styles.css` exist and are non-empty
- provide a local command that mirrors the release workflow's core checks

### `tests/version-bump.test.mjs` and `tests/validate-release.test.mjs`

Responsibilities:

- verify the success and failure behavior of the local release helper scripts
- keep the GitHub Actions workflow thin by moving important logic into testable Node scripts

### `package.json`

Responsibilities:

- keep `npm run version` wired to the synchronization script
- optionally add a small helper script only if it reduces confusion without expanding scope

### `README.md`

Responsibilities:

- add a short release section with the essential command flow
- keep end-user installation and usage docs concise

### `RELEASING.md`

Responsibilities:

- document the full release process
- explain the tag/version contract
- explain what the automation uploads
- explain how to recover when a release needs corrected assets
- note the Obsidian submission requirement that repo metadata and release metadata remain aligned

## Operational Notes

- The workflow should use GitHub-provided credentials only; no extra secrets should be required for normal releases
- The workflow should stay focused on release publication and avoid unrelated CI concerns
- PRs and branch pushes should not create releases
- The initial implementation should prefer clarity over cleverness

## Verification Plan

Before considering the implementation complete, verify:

1. `npm run version` updates all intended version files consistently
2. `npm run build` succeeds after the release automation changes
3. the workflow definition matches the chosen tag format
4. the workflow includes explicit checks for tag/version mismatches
5. the release documentation matches the implemented commands and behavior

## Open Decisions Resolved In This Design

- Canonical local version source: `package.json`
- Tag format: `1.0.1`, not `v1.0.1`
- Release trigger: pushed version tags only
- Release assets: `main.js`, `manifest.json`, `styles.css`
- Repair strategy for an existing release: supported through create-or-update workflow behavior

## Implementation Boundary

This work is complete when:

- a developer can prepare a release locally with the documented version flow
- pushing a matching version tag causes GitHub Actions to publish the required assets
- version drift between tag and manifest is blocked by automation
- the repository contains concise release documentation for future maintenance
