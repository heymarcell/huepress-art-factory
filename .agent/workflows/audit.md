---
description: perform a comprehensive code audit of the repository
---

# Code Audit Workflow

Perform a read-only security and quality audit of the codebase.

## Phase 0: Discovery

// turbo

```bash
find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" | head -50
```

// turbo

```bash
cat package.json | head -50
```

// turbo

```bash
cat README.md 2>/dev/null | head -100
```

Identify:

- Primary language(s) and frameworks
- Entry points (main, server, index files)
- External dependencies (DB, APIs, auth providers)
- Deployment shape (container, serverless, etc.)

## Phase 1: Architecture Map

Read and analyze:

1. Entry points (src/index.ts, src/api/index.ts, etc.)
2. Route handlers and API definitions
3. Auth/authz middleware
4. Database access patterns
5. Config and environment handling

Build a mental model of:

- Major modules and their responsibilities
- Main request/response flows
- Trust boundaries (untrusted input → processing → output)
- Key side effects (I/O, network, subprocess)

## Phase 2: Deep Review

Perform targeted review in these categories:

**A) Security**

- Authentication and authorization enforcement
- Input validation and injection risks
- Secrets management
- SSRF, path traversal, unsafe deserialization

**B) Correctness**

- Error handling and edge cases
- State management
- Idempotency

**C) Reliability**

- Timeouts and retries
- Concurrency safety
- Resource leaks

**D) Performance**

- N+1 queries
- Unbounded loops
- Heavy in-memory operations

**E) Testing**

- Coverage gaps
- Missing negative tests

## Phase 3: Run Verification

// turbo

```bash
npm run lint 2>&1 | head -50
```

// turbo

```bash
npm test -- --run 2>&1 | tail -50
```

Summarize results: command, result, key failures.

## Phase 4: Generate Report

Create findings with this template:

```markdown
### [Severity] [F-###] Title

- **Category**: Security/Correctness/Reliability/Performance/Testing
- **File**: path/to/file.ts
- **Location**: function name, lines X-Y
- **Evidence**: (max 12 lines of relevant code)
- **Why it matters**: 2-5 bullets on concrete failure modes
- **Suggested fix**: Minimal fix + safer refactor if applicable
- **Confidence**: High/Medium/Low
```

Severity ratings:

- **Critical**: Auth bypass, RCE, data loss
- **High**: Security failure with plausible trigger
- **Medium**: Real issue but constrained impact
- **Low**: Hygiene, clarity, minor perf

## Phase 5: Prioritize and Recommend

Create:

1. Risk Register table (Risk | Severity | Likelihood | Mitigation)
2. Recommended Next Actions (5-15 bullets, ordered by priority)

## Operating Rules

1. **Read-only** - Do not modify code unless explicitly asked
2. **Evidence-based** - Every claim must cite file + location
3. **No secrets** - Redact tokens/keys if encountered
4. **Be direct** - No filler, no buzzwords
5. **Say "Unknown"** - If you can't verify, state what evidence is needed

## Tool Budgeting

- Discovery: ≤6 file reads, ≤6 searches
- Deep review: ≤20 additional reads, ≤20 searches
- Execution: ≤5 commands (lint/test only, non-destructive)
