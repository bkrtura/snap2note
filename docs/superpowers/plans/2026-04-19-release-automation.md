# Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliable release workflow that keeps plugin version metadata in sync locally and publishes `main.js`, `manifest.json`, and `styles.css` automatically when a matching version tag is pushed.

**Architecture:** Keep the release flow small and explicit. Use a local Node script to synchronize version files, a second small Node script to validate release inputs and generated assets, and a tag-triggered GitHub Actions workflow that rebuilds from source and updates the matching GitHub Release.

**Tech Stack:** Node.js built-ins (`node:test`, `fs/promises`, `child_process`), npm lifecycle scripts, GitHub Actions, `ncipollo/release-action`

---

## File Structure

- `package.json`
  Keeps developer-facing npm scripts for test, build, version sync, and release validation.
- `version-bump.mjs`
  Reads the canonical version from `package.json` and synchronizes `manifest.json`, `package-lock.json`, and `versions.json`.
- `scripts/validate-release.mjs`
  Validates that a tag matches `package.json` and `manifest.json`, then checks that required release assets exist.
- `tests/version-bump.test.mjs`
  Covers success and failure paths for the local version synchronization script.
- `tests/validate-release.test.mjs`
  Covers success and failure paths for release validation logic used by the workflow.
- `.github/workflows/release.yml`
  Runs on version tag pushes, installs dependencies, builds the plugin, validates release metadata, and updates GitHub Releases.
- `README.md`
  Documents the short release flow for future maintainers.
- `RELEASING.md`
  Documents the full release process, recovery steps, and the Obsidian submission consistency requirements.

### Task 1: Add a Testable Version Sync Script

**Files:**
- Create: `tests/version-bump.test.mjs`
- Create: `version-bump.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the test runner script and write the failing version sync test**

Update `package.json` so the repository can run Node's built-in test runner:

```json
{
  "scripts": {
    "test": "node --test",
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  }
}
```

Create `tests/version-bump.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);
const scriptPath = path.join(rootDir, "version-bump.mjs");

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function createFixture() {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "snap2note-version-"));
  await mkdir(path.join(fixtureDir, "src"), { recursive: true });

  await writeJson(path.join(fixtureDir, "package.json"), {
    name: "snap2note",
    version: "1.2.3",
  });

  await writeJson(path.join(fixtureDir, "manifest.json"), {
    id: "snap2note",
    name: "Snap2Note",
    version: "1.0.0",
    minAppVersion: "1.4.0",
    description: "placeholder",
  });

  await writeJson(path.join(fixtureDir, "package-lock.json"), {
    name: "snap2note",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "snap2note",
        version: "1.0.0",
      },
    },
  });

  await writeJson(path.join(fixtureDir, "versions.json"), {
    "1.0.0": "1.4.0",
  });

  return fixtureDir;
}

test("version-bump syncs manifest, package-lock, and versions from package.json", async () => {
  const fixtureDir = await createFixture();

  const result = spawnSync("node", [scriptPath], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);

  const manifest = await readJson(path.join(fixtureDir, "manifest.json"));
  const packageLock = await readJson(path.join(fixtureDir, "package-lock.json"));
  const versions = await readJson(path.join(fixtureDir, "versions.json"));

  assert.equal(manifest.version, "1.2.3");
  assert.equal(packageLock.version, "1.2.3");
  assert.equal(packageLock.packages[""].version, "1.2.3");
  assert.deepEqual(versions, { "1.2.3": "1.4.0" });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm test -- --test-name-pattern="version-bump syncs manifest, package-lock, and versions from package.json"
```

Expected: FAIL because `version-bump.mjs` does not exist yet, or exits non-zero.

- [ ] **Step 3: Write the minimal `version-bump.mjs` implementation**

Create `version-bump.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const manifestPath = path.join(cwd, "manifest.json");
  const packageLockPath = path.join(cwd, "package-lock.json");
  const versionsPath = path.join(cwd, "versions.json");

  const packageJson = await readJson(packageJsonPath);
  const manifest = await readJson(manifestPath);
  const packageLock = await readJson(packageLockPath);

  if (!packageJson.version || typeof packageJson.version !== "string") {
    throw new Error("package.json must contain a string version");
  }

  if (!manifest.minAppVersion || typeof manifest.minAppVersion !== "string") {
    throw new Error("manifest.json must contain a string minAppVersion");
  }

  manifest.version = packageJson.version;
  packageLock.version = packageJson.version;
  packageLock.packages ??= {};
  packageLock.packages[""] ??= {};
  packageLock.packages[""].version = packageJson.version;

  const versions = {
    [packageJson.version]: manifest.minAppVersion,
  };

  await writeJson(manifestPath, manifest);
  await writeJson(packageLockPath, packageLock);
  await writeJson(versionsPath, versions);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:

```bash
npm test -- --test-name-pattern="version-bump syncs manifest, package-lock, and versions from package.json"
```

Expected: PASS with 1 test passing.

- [ ] **Step 5: Commit the task**

Run:

```bash
git add package.json tests/version-bump.test.mjs version-bump.mjs
git commit -m "feat: add version sync script"
```

### Task 2: Add Failure Coverage and Finish npm Version Integration

**Files:**
- Modify: `tests/version-bump.test.mjs`
- Modify: `version-bump.mjs`
- Modify: `package.json`

- [ ] **Step 1: Extend the version sync test file with a failing error-path test**

Append this test to `tests/version-bump.test.mjs`:

```js
test("version-bump fails with a clear error when versions.json is unreadable", async () => {
  const fixtureDir = await createFixture();

  await writeFile(path.join(fixtureDir, "versions.json"), "", "utf8");

  const result = spawnSync("node", [scriptPath], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /versions\.json/i);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails for the expected reason**

Run:

```bash
npm test -- --test-name-pattern="version-bump fails with a clear error when versions.json is unreadable"
```

Expected: FAIL because the current script does not read or validate `versions.json`.

- [ ] **Step 3: Tighten the script and update the npm lifecycle staging command**

Update `version-bump.mjs` so it reads `versions.json` before writing and emits file-specific errors:

```js
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(filePath)}: ${message}`);
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const manifestPath = path.join(cwd, "manifest.json");
  const packageLockPath = path.join(cwd, "package-lock.json");
  const versionsPath = path.join(cwd, "versions.json");

  const packageJson = await readJson(packageJsonPath);
  const manifest = await readJson(manifestPath);
  const packageLock = await readJson(packageLockPath);
  await readJson(versionsPath);

  if (!packageJson.version || typeof packageJson.version !== "string") {
    throw new Error("package.json must contain a string version");
  }

  if (!manifest.minAppVersion || typeof manifest.minAppVersion !== "string") {
    throw new Error("manifest.json must contain a string minAppVersion");
  }

  manifest.version = packageJson.version;
  packageLock.version = packageJson.version;
  packageLock.packages ??= {};
  packageLock.packages[""] ??= {};
  packageLock.packages[""].name ??= packageJson.name;
  packageLock.packages[""].version = packageJson.version;

  await writeJson(manifestPath, manifest);
  await writeJson(packageLockPath, packageLock);
  await writeJson(versionsPath, {
    [packageJson.version]: manifest.minAppVersion,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

Update the `version` script in `package.json` so the full release metadata set is staged:

```json
{
  "scripts": {
    "test": "node --test",
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add package.json package-lock.json manifest.json versions.json"
  }
}
```

- [ ] **Step 4: Run the full test suite to verify both version script tests pass**

Run:

```bash
npm test
```

Expected: PASS with both `tests/version-bump.test.mjs` tests green.

- [ ] **Step 5: Commit the task**

Run:

```bash
git add package.json tests/version-bump.test.mjs version-bump.mjs
git commit -m "test: cover version sync failures"
```

### Task 3: Add a Release Validator and GitHub Release Workflow

**Files:**
- Create: `tests/validate-release.test.mjs`
- Create: `scripts/validate-release.mjs`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`

- [ ] **Step 1: Write the failing release validator tests**

Create `tests/validate-release.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);
const scriptPath = path.join(rootDir, "scripts", "validate-release.mjs");

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture() {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "snap2note-release-"));
  await mkdir(path.join(fixtureDir, "scripts"), { recursive: true });

  await writeJson(path.join(fixtureDir, "package.json"), {
    name: "snap2note",
    version: "1.2.3",
  });

  await writeJson(path.join(fixtureDir, "manifest.json"), {
    id: "snap2note",
    name: "Snap2Note",
    version: "1.2.3",
    minAppVersion: "1.4.0",
    description: "placeholder",
  });

  await writeFile(path.join(fixtureDir, "main.js"), "console.log('ok');\n", "utf8");
  await writeFile(path.join(fixtureDir, "styles.css"), "body {}\n", "utf8");

  return fixtureDir;
}

test("validate-release passes when tag, manifest, package version, and assets match", async () => {
  const fixtureDir = await createFixture();

  const result = spawnSync("node", [scriptPath, "1.2.3"], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("validate-release fails when the tag does not match manifest and package versions", async () => {
  const fixtureDir = await createFixture();

  const result = spawnSync("node", [scriptPath, "1.2.4"], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match/i);
});

test("validate-release fails when the tag format is not a bare semantic version", async () => {
  const fixtureDir = await createFixture();

  const result = spawnSync("node", [scriptPath, "release-1.2.3"], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /semantic version/i);
});

test("validate-release fails when a required asset is empty", async () => {
  const fixtureDir = await createFixture();
  await writeFile(path.join(fixtureDir, "styles.css"), "", "utf8");

  const result = spawnSync("node", [scriptPath, "1.2.3"], {
    cwd: fixtureDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /styles\.css/i);
});
```

- [ ] **Step 2: Run the targeted validator tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern="validate-release"
```

Expected: FAIL because `scripts/validate-release.mjs` does not exist yet.

- [ ] **Step 3: Implement the release validator and add a package script for it**

Create `scripts/validate-release.mjs`:

```js
import { access, readFile } from "node:fs/promises";
import path from "node:path";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function assertFileExists(filePath) {
  await access(filePath);
}

async function main() {
  const cwd = process.cwd();
  const tagName = process.argv[2] || process.env.GITHUB_REF_NAME;

  if (!tagName) {
    throw new Error("Release tag is required as argv[2] or GITHUB_REF_NAME");
  }

  if (!/^\d+\.\d+\.\d+$/.test(tagName)) {
    throw new Error(`Release tag ${tagName} must be a bare semantic version like 1.2.3`);
  }

  const packageJson = await readJson(path.join(cwd, "package.json"));
  const manifest = await readJson(path.join(cwd, "manifest.json"));

  if (packageJson.version !== tagName) {
    throw new Error(`package.json version ${packageJson.version} does not match tag ${tagName}`);
  }

  if (manifest.version !== tagName) {
    throw new Error(`manifest.json version ${manifest.version} does not match tag ${tagName}`);
  }

  for (const assetName of ["main.js", "manifest.json", "styles.css"]) {
    const assetPath = path.join(cwd, assetName);
    await assertFileExists(assetPath);
    const statTarget = await readFile(assetPath, "utf8");
    if (!statTarget.trim()) {
      throw new Error(`${assetName} is empty or missing content`);
    }
  }

  console.log(`Release metadata validated for ${tagName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "test": "node --test",
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add package.json package-lock.json manifest.json versions.json",
    "release:check": "node scripts/validate-release.mjs"
  }
}
```

- [ ] **Step 4: Run the full test suite to verify the validator tests pass**

Run:

```bash
npm test
```

Expected: PASS with both `tests/version-bump.test.mjs` and `tests/validate-release.test.mjs` green.

- [ ] **Step 5: Add the GitHub Actions release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "*.*.*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - name: Check out the tagged commit
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build plugin assets
        run: npm run build

      - name: Validate release metadata and assets
        run: npm run release:check -- "${GITHUB_REF_NAME}"

      - name: Publish GitHub Release assets
        uses: ncipollo/release-action@v1
        with:
          tag: ${{ github.ref_name }}
          allowUpdates: true
          replacesArtifacts: true
          artifactErrorsFailBuild: true
          artifacts: "main.js,manifest.json,styles.css"
```

- [ ] **Step 6: Run local verification for the new helper script and build flow**

Run:

```bash
npm run build
npm run release:check -- 1.0.0
```

Expected:

- `npm run build` exits 0
- `npm run release:check -- 1.0.0` prints `Release metadata validated for 1.0.0`

- [ ] **Step 7: Commit the task**

Run:

```bash
git add package.json scripts/validate-release.mjs tests/validate-release.test.mjs .github/workflows/release.yml
git commit -m "feat: automate GitHub releases"
```

### Task 4: Document the Release Flow for Future Maintainers

**Files:**
- Create: `RELEASING.md`
- Modify: `README.md`

- [ ] **Step 1: Add a short release section to `README.md`**

Insert this section before `## License`:

````md
## Release

```bash
npm version 1.0.1 --no-git-tag-version
git commit -am "chore: release 1.0.1"
git tag 1.0.1
git push origin main 1.0.1
```

Pushing the version tag triggers GitHub Actions to rebuild `main.js` and update the matching GitHub Release with `main.js`, `manifest.json`, and `styles.css`.
````

- [ ] **Step 2: Add full release instructions to `RELEASING.md`**

Create `RELEASING.md`:

````md
# Releasing Snap2Note

## Release checklist

1. Make sure `main` contains the code you want to publish.
2. Run `npm test`.
3. Run `npm version <x.y.z> --no-git-tag-version`.
4. Review `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`.
5. Run `npm run build`.
6. Commit the release prep changes.
7. Create and push a matching Git tag, for example `git tag 1.0.1 && git push origin main 1.0.1`.
8. Wait for the `Release` GitHub Actions workflow to finish.
9. Confirm the GitHub Release contains `main.js`, `manifest.json`, and `styles.css`.

## How version sync works

- `package.json` is the local source of truth for the version.
- The npm `version` lifecycle runs `node version-bump.mjs`.
- `version-bump.mjs` rewrites `manifest.json`, `package-lock.json`, and `versions.json`.

## How release validation works

- `npm run release:check -- <tag>` verifies that `package.json` and `manifest.json` match the tag.
- The same check runs inside `.github/workflows/release.yml`.
- The workflow also verifies that `main.js`, `manifest.json`, and `styles.css` exist before publishing.

## Repairing an existing release

If a tag already has a GitHub Release and the assets are wrong:

1. Check out the commit you want to publish for that version.
2. Rebuild and verify locally with `npm test`, `npm run build`, and `npm run release:check -- <tag>`.
3. Re-run the `Release` workflow for that tag, or push a corrected commit and recreate the tag if you intentionally want the tag to move.

## Obsidian submission consistency

Before updating the Obsidian community plugin submission, make sure these three places match exactly:

- `manifest.json` version and description
- GitHub Release tag and uploaded assets
- the plugin description used in the submission pull request
````

- [ ] **Step 3: Sanity-check that both docs mention the exact release commands**

Run:

```bash
rg -n "npm version|git tag|release:check|manifest.json" README.md RELEASING.md
```

Expected: matches in both files covering the short flow and the detailed recovery notes.

- [ ] **Step 4: Commit the task**

Run:

```bash
git add README.md RELEASING.md
git commit -m "docs: add release guide"
```

### Task 5: Final Verification Before Merge or Push

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `versions.json`
- Create: `version-bump.mjs`
- Create: `scripts/validate-release.mjs`
- Create: `tests/version-bump.test.mjs`
- Create: `tests/validate-release.test.mjs`
- Create: `.github/workflows/release.yml`
- Create: `RELEASING.md`

- [ ] **Step 1: Run the full local verification suite**

Run:

```bash
npm test
npm run build
npm run release:check -- 1.0.0
```

Expected:

- test runner exits 0
- build exits 0
- release checker prints `Release metadata validated for 1.0.0`

- [ ] **Step 2: Review the final diff for release-only scope**

Run:

```bash
git diff -- package.json README.md RELEASING.md version-bump.mjs scripts/validate-release.mjs tests/version-bump.test.mjs tests/validate-release.test.mjs .github/workflows/release.yml manifest.json versions.json package-lock.json
```

Expected: the diff contains only release automation, tests, and documentation changes.

- [ ] **Step 3: Create the final integration commit**

Run:

```bash
git add package.json README.md RELEASING.md version-bump.mjs scripts/validate-release.mjs tests/version-bump.test.mjs tests/validate-release.test.mjs .github/workflows/release.yml manifest.json versions.json package-lock.json
git commit -m "chore: add release automation"
```
