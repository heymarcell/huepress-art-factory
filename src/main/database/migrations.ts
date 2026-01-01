import type Database from 'better-sqlite3';
import log from 'electron-log/main';

/**
 * Migration interface
 */
interface Migration {
  version: number;
  name: string;
  up: string;
}

/**
 * All database migrations
 * Each migration should be idempotent where possible
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Batches table
      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        name TEXT,
        imported_at TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        raw_source TEXT
      );

      -- Ideas table
      CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        skill TEXT NOT NULL,
        tags TEXT,
        extended_description TEXT,
        fun_facts TEXT,
        suggested_activities TEXT,
        coloring_tips TEXT,
        therapeutic_benefits TEXT,
        meta_keywords TEXT,
        status TEXT NOT NULL DEFAULT 'Imported',
        dedupe_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
      );

      -- Generation attempts table
      CREATE TABLE IF NOT EXISTS generation_attempts (
        id TEXT PRIMARY KEY,
        idea_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('generate', 'edit')),
        prompt_template_version TEXT NOT NULL,
        request TEXT NOT NULL,
        response_meta TEXT,
        image_path TEXT,
        image_sha256 TEXT,
        qc_report TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
      );

      -- Export runs table
      CREATE TABLE IF NOT EXISTS export_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        destination TEXT NOT NULL,
        items TEXT NOT NULL,
        profile_name TEXT,
        result_log TEXT
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
      CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
      CREATE INDEX IF NOT EXISTS idx_ideas_skill ON ideas(skill);
      CREATE INDEX IF NOT EXISTS idx_ideas_batch ON ideas(batch_id);
      CREATE INDEX IF NOT EXISTS idx_ideas_dedupe ON ideas(dedupe_hash);
      CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at);
      CREATE INDEX IF NOT EXISTS idx_attempts_idea ON generation_attempts(idea_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_created ON generation_attempts(created_at);
    `,
  },
  {
    version: 2,
    name: 'add_prompt_templates',
    up: `
      -- Prompt templates table for versioning
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        user_prompt_template TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0
      );

      -- Insert default template
      INSERT OR IGNORE INTO prompt_templates (id, version, name, system_prompt, user_prompt_template, created_at, is_default)
      VALUES (
        'default-v1',
        'v1.0.0',
        'Default Coloring Page Template',
        'You are an expert illustrator specializing in creating black and white line art coloring pages. Your illustrations are:
- Pure black lines on white background (no gray tones, no shading, no gradients)
- Clean, closed lines suitable for flood-fill coloring
- Age-appropriate and engaging
- Free of any text, watermarks, or signatures
- Without decorative borders or frames
- Properly spaced with adequate margins',
        'Create a coloring page illustration based on:

Title: {{title}}
Description: {{description}}
Category: {{category}}
Skill Level: {{skill}}

{{#if extended_description}}
Additional Details: {{extended_description}}
{{/if}}

Requirements:
- Pure black and white line art only
- No shading, gradients, or gray tones
- All areas should be clearly defined for coloring
- Skill level "{{skill}}" means: {{skill_description}}
- No borders or frames around the image
- Leave appropriate margins',
        datetime('now'),
        1
      );
    `,
  },
  {
    version: 3,
    name: 'add_selected_attempt',
    up: `
      ALTER TABLE ideas ADD COLUMN selected_attempt_id TEXT REFERENCES generation_attempts(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 4,
    name: 'add_notes_column',
    up: `
      ALTER TABLE ideas ADD COLUMN notes TEXT;
    `,
  },
  {
    version: 5,
    name: 'add_embedding_column',
    up: `
      ALTER TABLE ideas ADD COLUMN embedding BLOB;
    `,
  },
];

/**
 * Run all pending migrations
 */
export async function runMigrations(db: Database.Database): Promise<void> {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // Get current version
  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM schema_migrations'
  ).get() as { version: number | null };

  const startVersion = currentVersion?.version ?? 0;
  log.info(`Current database version: ${startVersion}`);

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > startVersion) {
      log.info(`Running migration ${migration.version}: ${migration.name}`);

      const transaction = db.transaction(() => {
        // Run migration
        db.exec(migration.up);

        // Record migration
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, new Date().toISOString());
      });

      transaction();
      log.info(`Migration ${migration.version} completed`);
    }
  }

  const finalVersion = migrations[migrations.length - 1]?.version ?? 0;
  log.info(`Database is at version ${finalVersion}`);
}
