---
description: comprehensive codebase analysis to understand every script and generate an up-to-date README
---

# Codebase Analysis & README Generation Workflow

Perform a deep, comprehensive analysis of the entire codebase and generate a state-of-the-art README that accurately reflects the project's architecture, features, and usage.

## Phase 0: Discovery & Inventory

### 0.1 Project Metadata Extraction

// turbo

```bash
cat package.json | jq '{name, version, description, main, scripts, dependencies, devDependencies}'
```

// turbo

```bash
cat wrangler.toml 2>/dev/null || echo "No wrangler.toml found"
```

// turbo

```bash
cat tsconfig.json 2>/dev/null | head -30
```

### 0.2 Directory Structure Mapping

// turbo

```bash
find . -type d \( -name node_modules -o -name .git -o -name dist -o -name coverage -o -name .wrangler \) -prune -o -type d -print | head -50
```

// turbo

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/.wrangler/*" ! -path "*/dist/*" | wc -l
```

Capture:

- Total number of source files
- Top-level directory structure
- Key configuration files present

### 0.3 Entry Point Identification

// turbo

```bash
# Identify all potential entry points
find . -name "index.ts" -o -name "index.tsx" -o -name "main.ts" -o -name "main.tsx" -o -name "server.js" -o -name "server.ts" | grep -v node_modules | head -20
```

## Phase 1: Deep Architecture Analysis

### 1.1 Frontend Analysis

Read and analyze:

1. **Main entry point**: `src/main.tsx` or equivalent
2. **App structure**: `src/App.tsx`, routing setup
3. **Components directory**: Understand component hierarchy and patterns
4. **State management**: Identify hooks, contexts, stores
5. **API client**: How frontend communicates with backend
6. **Styling approach**: CSS modules, Tailwind, styled-components

Document:

- Component architecture pattern (atomic design, feature-based, etc.)
- Key UI libraries and design system
- Form handling and validation approach
- Authentication integration on frontend

### 1.2 Backend/API Analysis

Read and analyze:

1. **API entry**: `src/api/index.ts` or equivalent
2. **Route definitions**: All route handlers in `routes/` directory
3. **Middleware**: Auth, validation, error handling
4. **Database access**: ORM/query patterns, migrations
5. **External integrations**: Third-party APIs, webhooks

Document:

- API framework and patterns
- Authentication/Authorization flow
- Data validation approach (Zod, Joi, etc.)
- Error handling strategy
- Rate limiting and security middleware

### 1.3 Processing/Service Analysis

If applicable (container, serverless functions, workers):

1. **Container code**: `container/` directory
2. **Background jobs**: Queue handling, scheduled tasks
3. **Resource-intensive operations**: Image processing, PDF generation

Document:

- Service architecture and responsibilities
- Communication patterns (HTTP, RPC, queues)
- Scaling considerations

### 1.4 Database & Storage Analysis

1. **Migrations**: Read all migration files in `migrations/`
2. **Schema**: Document all tables, relationships, indices
3. **Storage**: R2, S3, or equivalent configuration

Document:

- Complete data model with relationships
- Migration history and versioning strategy
- Storage buckets and their purposes

## Phase 2: Script & Utility Mapping

### 2.1 NPM Scripts Analysis

// turbo

```bash
cat package.json | jq '.scripts'
```

For each script, document:

- Purpose and when to use
- Required environment variables
- Expected output

### 2.2 Custom Scripts

// turbo

```bash
find ./scripts -type f 2>/dev/null | head -20
```

Read and document any custom automation scripts.

### 2.3 Configuration Files

Analyze all configuration:

- `vite.config.ts` / build configuration
- `tailwind.config.ts` / styling configuration
- `eslint.config.js` / linting rules
- `vitest.config.ts` / test configuration
- `tsconfig.json` / TypeScript settings
- `wrangler.toml` / Cloudflare settings
- Docker/container configuration

## Phase 3: Test Suite Analysis

// turbo

```bash
find ./tests -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | head -30
```

Document:

- Test framework and configuration
- Test directory structure
- Coverage requirements
- Key test categories (unit, integration, e2e)

## Phase 4: Dependency Audit

### 4.1 Production Dependencies

Categorize all dependencies by purpose:

- **Framework**: React, Hono, etc.
- **UI**: Tailwind, component libraries
- **State**: TanStack Query, Zustand, etc.
- **Validation**: Zod, etc.
- **Auth**: Clerk, Auth0, etc.
- **Payments**: Stripe, etc.
- **Utils**: date-fns, lodash, etc.

### 4.2 Dev Dependencies

- Build tools
- Testing frameworks
- Linting/formatting
- Type definitions

## Phase 5: Environment & Secrets Mapping

// turbo

```bash
cat .env.example 2>/dev/null || echo "No .env.example found"
```

// turbo

```bash
grep -r "process.env\|import.meta.env\|c.env\." --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | head -30
```

Document:

- All required environment variables
- Which are secrets vs configuration
- Default values where applicable
- Where each is used

## Phase 6: API Endpoint Inventory

// turbo

```bash
grep -rn "\.get\|\.post\|\.put\|\.patch\|\.delete" --include="*.ts" src/api/ | head -50
```

Create comprehensive endpoint table:

| Method | Path | Description | Auth | Request Body | Response |
| ------ | ---- | ----------- | ---- | ------------ | -------- |

## Phase 7: Generate Comprehensive README

### README Structure (Following Best Practices)

Create a README with these sections:

1. **Header**

   - Project name with logo/badge
   - One-line description
   - Key badges (build status, version, license)

2. **Table of Contents**

   - Auto-navigable links for each section

3. **Overview / What This Is**

   - Project purpose (2-3 sentences)
   - Key features list
   - Target audience

4. **Tech Stack**

   - Visual list of technologies with versions
   - Frontend, Backend, Database, Infrastructure

5. **Architecture**

   - Mermaid diagram showing system components
   - Key architectural decisions
   - Data flow overview

6. **Getting Started**

   - Prerequisites with versions
   - Step-by-step installation
   - Environment setup
   - Running locally

7. **Project Structure**

   - Directory tree with descriptions
   - Key files and their purposes

8. **Development**

   - Available scripts
   - Code style and conventions
   - Testing guide
   - Hot reload / debugging tips

9. **API Reference**

   - Authentication overview
   - Endpoint tables grouped by resource
   - Request/Response examples

10. **Database Schema**

    - Tables and relationships
    - Mermaid ER diagram if applicable

11. **Deployment**

    - Production deployment steps
    - Environment configuration
    - Monitoring and logs

12. **Configuration Reference**

    - All environment variables
    - Config file explanations

13. **Troubleshooting**

    - Common issues and solutions
    - Debug strategies

14. **Contributing**

    - How to contribute
    - Branch strategy
    - PR process

15. **License**

16. **Acknowledgements** (if applicable)

### README Quality Checklist

Before finalizing, verify:

- [ ] All code examples are tested and work
- [ ] Links are valid
- [ ] Diagrams render correctly
- [ ] No placeholder text remains
- [ ] Environment variables are complete
- [ ] Commands are platform-appropriate
- [ ] API endpoints match actual implementation
- [ ] Database schema matches migrations

## Phase 8: Output & Review

### 8.1 Create Analysis Artifact

Create `docs/CODEBASE_ANALYSIS.md` with:

- Complete component inventory
- Dependency graph
- API endpoint map
- Environment variable index
- Architecture diagrams

### 8.2 Update README

**IMPORTANT**: Back up existing README first.

// turbo

```bash
cp README.md README.md.backup 2>/dev/null || true
```

Replace `README.md` with comprehensive new version.

### 8.3 Create Comparison

Show diff of old vs new README to highlight improvements.

## Operating Rules

1. **Read thoroughly** - Read every file mentioned, don't skim
2. **Verify claims** - Every statement must be backed by code evidence
3. **No assumptions** - If unclear, note it as "Needs clarification"
4. **Current state** - Document what IS, not what should be
5. **Actionable** - All instructions must be copy-paste executable
6. **Accessible** - Write for newcomers, not just experts

## Tool Budgeting

- Phase 0-1: ≤30 file reads, ≤20 searches
- Phase 2-4: ≤20 file reads, ≤15 searches
- Phase 5-6: ≤10 searches, ≤5 commands
- Phase 7-8: ≤10 file writes

## Quality Standards (Based on Best Practices)

The generated README should:

1. **Have a professional appearance** with proper formatting
2. **Use Mermaid diagrams** for architecture visualization
3. **Include working code examples** for all common tasks
4. **Be scannable** with clear headers and bullet points
5. **Stay current** by referencing actual code, not assumptions
6. **Be comprehensive yet concise** - link to detailed docs where appropriate
7. **Cover multiple audiences** - new developers, contributors, operators
