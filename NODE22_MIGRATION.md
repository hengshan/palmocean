# Node 22 Migration Guide

This document tracks all changes made to make PalmView (Kepler.gl fork) compatible with Node.js 22.x.

## Branch: `feature/geoai-tab`
## Baseline: Node 18 → Node 22

---

## Changes Made

### 1. Import Assertions → Import Attributes (`assert` → `with`)

**Issue:** Node 22 deprecates (and newer versions remove) the `assert {type: 'json'}` syntax in favour of `with {type: 'json'}` per the TC39 Import Attributes proposal.

**Files fixed:**
- `esbuild/umd-esbuild.config.mjs` — `import KeplerPackage from '../package.json' with {type: 'json'}`
- `examples/demo-app/esbuild.config.mjs` — `import KeplerPackage from '../../package.json' with {type: 'json'}`
- `examples/replace-component/esbuild.config.mjs` — `import KeplerPackage from '../../package.json' with {type: 'json'}`
- `website/esbuild.config.mjs` — `import WebsitePackage from '../package.json' with {type: 'json'}`

**Command to verify no remaining instances:**
```bash
grep -rn "assert {type:" ~/projects/palmview --include="*.mjs" --include="*.js" --include="*.ts" --exclude-dir=node_modules
```

---

### 2. `@mapbox/tiny-sdf` Upgrade (1.2.5 → 2.0.6)

**Issue:** `@deck.gl/layers@8.9.36` requires `@mapbox/tiny-sdf@^2.0.5` but version 1.2.5 was installed. The test harness (via `babel.config.js`) maps `@mapbox/tiny-sdf` to `./node_modules/@mapbox/tiny-sdf/index.cjs`. This file doesn't exist in v1.x.

**Fix:** Upgraded `@mapbox/tiny-sdf` to `2.0.6` via `yarn add @mapbox/tiny-sdf@^2.0.5`.

The `scripts/fix-dependencies.sh` script already creates `index.cjs` via Babel transpilation for the test suite.

---

### 3. `gl` Native Addon – ANGLE C++ Header Patch

**Issue:** `gl@6.0.2` bundles an old version of ANGLE. When compiled with GCC 13+ (Ubuntu 24.04) on Node 22, the C++ file `angle/src/common/angleutils.h` fails with:
```
error: 'uintptr_t' does not name a type
```
This is because newer GCC versions require `#include <cstdint>` to be explicit where older versions provided it transitively.

**Fix applied to** `node_modules/gl/angle/src/common/angleutils.h`:
```diff
 #include <cstddef>
+#include <cstdint>
```

**`scripts/fix-dependencies.sh` updated** to:
1. Detect and apply the `#include <cstdint>` patch if missing
2. Rebuild the `gl` native addon if `build/Release/webgl.node` is missing

**Affected systems:** Ubuntu 24.04 (GCC 13), likely any GCC 13+ environment.

---

### 4. `scripts/fix-dependencies.sh` Enhancements

Added Node 22 / GCC 13+ sections:
- Patches `node_modules/gl/angle/src/common/angleutils.h` idempotently
- Rebuilds `gl` native addon if the compiled `.node` file is absent

Run after every `yarn install`:
```bash
yarn fix-dependencies
```

---

## Test Results on Node 22.16.0

After all fixes:

### Tape tests (node)
```
# tests 10751
# pass  10751
# ok
```

### Jest tests
```
Test Suites: 13 passed, 13 total
Tests:       135 passed, 135 total
Snapshots:   0 total
Time:        ~5s
```

### Root build
```bash
yarn build  # ✅ Successfully compiled 466 files with Babel
```

### Demo-app build
```bash
MapboxAccessToken=dummy yarn build  # ✅ dist/bundle.js 16.9mb
```

---

## Deprecated Node 22 APIs Audit

Scanned `src/` for known deprecated/removed APIs:

| API | Status | Notes |
|-----|--------|-------|
| `new Buffer()` | ✅ Not found | No usage in source |
| `url.parse()` | ✅ Not found | Bundled mapbox-gl vendored copy only (not our code) |
| `process.binding()` | ✅ Not found | — |
| `new SlowBuffer()` | ✅ Not found | — |
| `require('constants')` | ✅ Not found | — |
| `assert {type: 'json'}` | ✅ Fixed | All 4 files updated to `with {type: 'json'}` |

---

## Remaining Known Issues

### `gl@6.0.2` compatibility
- The `gl` package v6.x is not officially Node 22 compatible (uses old ANGLE).
- Our patch to `angleutils.h` works but lives in `node_modules/`.
- **Long-term recommendation:** Upgrade `gl` to v8.x (`gl@^8.1.6`) which officially supports Node ≥ 18.
- Current workaround is automated in `scripts/fix-dependencies.sh`.

### Missing optional env vars in demo-app build
- `DropboxClientId`, `MapboxExportToken`, `CartoClientId`, `FoursquareClientId` etc.
- These are cosmetic warnings, not Node 22 issues.

---

## Setup Instructions for Node 22

```bash
# 1. Enable corepack (yarn 4.4.0)
corepack enable

# 2. Install dependencies
cd ~/projects/palmview && yarn install

# 3. Apply Node 22 fixes
yarn fix-dependencies

# 4. Build
yarn build

# 5. Test
yarn test
```
