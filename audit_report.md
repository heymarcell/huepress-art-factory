# Code Audit Report

**Date**: 2026-01-01
**Project**: coloring-generator

## Executive Summary

The application is a well-structured Electron desktop app using React, TypeScript, and Vite. The architecture follows good separation of concerns between Main and Renderer processes. Security hygiene is generally good (Context Isolation enabled, Node Integration disabled), but a critical vulnerability exists in the local file handling protocol.

## Phase 0: Discovery

- **Frameworks**: Electron, React, Vite
- **Language**: TypeScript throughout
- **Database**: SQLite (better-sqlite3) with migrations
- **AI Integration**: Google Gemini (via `@google/genai`)
- **State Management**: Zustand (Renderer), JSON file (Settings)

## Findings

### [Critical] [F-001] Arbitrary File Read via Asset Protocol

- **Category**: Security
- **File**: `src/main/index.ts`
- **Location**: `protocol.registerFileProtocol`, lines 121-133
- **Evidence**:
  ```typescript
  const url = request.url.replace('asset://', '');
  try {
    const decodedUrl = decodeURIComponent(url);
    // ...
    callback(decodedUrl); // Directly serves file at path
  ```
- **Why it matters**:
  - The `asset://` protocol bypasses CSP and performs no path validation.
  - An attacker achieving XSS (or a bug in the renderer) could request `asset:///etc/passwd` or `asset:///Users/heymarcell/.ssh/id_rsa`.
  - This effectively grants full filesystem read access to the renderer process.
- **Suggested fix**: Use `isPathAllowed` from `src/main/utils/paths.ts` to ensure `decodedUrl` is within `userData` or `assets` directories.
- **Confidence**: High

### [High] [F-002] O(N²) Performance Bottleneck in Duplicate Finding

- **Category**: Performance
- **File**: `src/main/ipc/ideas.ts`
- **Location**: `IDEAS_FIND_DUPLICATES`, lines 577-636
- **Evidence**:
  ```typescript
  for (let i = 0; i < ideas.length; i++) {
    // ...
    for (let j = i + 1; j < ideas.length; j++) {
      // ... cosineSimilarity(vecA, vecB)
    }
  }
  ```
- **Why it matters**:
  - This implementation compares every idea against every other idea.
  - With 1,000 ideas, this is ~500,000 vector operations.
  - With 5,000 ideas, this is ~12.5 million operations, which will freeze the node process (and thus the IPC channel) for seconds or minutes.
- **Suggested fix**:
  - Use `sqlite-vss` for vector search in the database.
  - Or implement a blocking strategy (only compare within same category/skill or simplified hash buckets).
- **Confidence**: High

### [Medium] [F-003] Potential API Key Exposure on Linux

- **Category**: Security
- **File**: `src/main/ipc/settings.ts`
- **Location**: `SETTINGS_SET_API_KEY`, lines 152-155
- **Evidence**:
  ```typescript
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn("Encryption not available, storing API key in plain text");
    settings.encryptedApiKey = apiKey;
  }
  ```
- **Why it matters**:
  - On Linux (often used by developers), `safeStorage` requires a configured keyring (SecretService/KWallet). If missing, keys are stored in plaintext in `~/.config`.
  - Other applications or malware can easily harvest these keys.
- **Suggested fix**: Explicitly warn the user in the UI if encryption is unavailable, or refuse to store the key.
- **Confidence**: Medium

### [Low] [F-004] Regex Lint Error in Path Utility

- **Category**: Correctness
- **File**: `src/main/utils/paths.ts`
- **Location**: `sanitizeFilename`, line 37
- **Evidence**: `eslint` error: `Unexpected control character(s) in regular expression: \x00, \x1f`.
- **Why it matters**: While valid in JS, some linters/parsers flag this. It works, but reduces code quality score.
- **Suggested fix**: Disable the lint rule for that line or use hex escapes if possible (already using hex, maybe linter is just strict).
- **Confidence**: High

## Risk Register

| Risk                                          | Severity | Likelihood               | Mitigation                                              |
| --------------------------------------------- | -------- | ------------------------ | ------------------------------------------------------- |
| Local File Inclusion (LFI) via asset protocol | Critical | Low (requires XSS first) | **Immediate**: Validate paths in protocol handler       |
| App Freezing on Duplicate Find                | High     | High (as usage grows)    | **Near-term**: Optimize algorithm                       |
| API Key Theft                                 | Medium   | Medium (Linux users)     | **Medium-term**: Better warnings/encryption enforcement |

## Recommended Next Actions

1.  **[P0] Patch Asset Protocol**: Update `src/main/index.ts` to enforce path allowlisting using `src/main/utils/paths.ts`.
2.  **[P1] Optimize Duplication Check**: Refactor `IDEAS_FIND_DUPLICATES` to avoid O(N^2) loop or offload to a worker thread/native extension.
3.  **[P2] Fix Lints**: Resolve `no-control-regex` in `paths.ts` and `no-explicit-any` warnings.
