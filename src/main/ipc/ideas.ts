import { ipcMain } from 'electron';
import { z } from 'zod';
import { ulid } from 'ulid';
import crypto from 'node:crypto';
import log from 'electron-log/main';
import { getDatabase } from '../database';
import { validateIpcPayload } from '../security';
import { getEmbedding, cosineSimilarity } from '../services/embedding';
import {
  IPC_CHANNELS,
  successResponse,
  errorResponse,
} from '../../shared/ipc-channels';
import {
  IdeaArraySchema,
  IdeaStatusSchema,
  type Idea,
  type IdeaInput,
} from '../../shared/schemas';

// =============================================================================
// Validation Schemas
// =============================================================================

const ListFiltersSchema = z.object({
  status: z.array(IdeaStatusSchema).optional(),
  category: z.array(z.string()).optional(),
  skill: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  batchId: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

const UpdateFieldsSchema = z.object({
  id: z.string(),
  fields: z.object({
    status: IdeaStatusSchema.optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    skill: z.string().optional(),
    ignore_duplicates: z.boolean().or(z.number()).optional(),
  }),
});

const SetVersionSchema = z.object({
  ideaId: z.string(),
  attemptId: z.string(),
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a deterministic dedupe hash for an idea
 */
function generateDedupeHash(idea: IdeaInput): string {
  const content = `${idea.title}|${idea.description}|${idea.category}|${idea.skill}`;
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Parse JSON arrays stored in database columns
 */
function parseJsonArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Convert database row to Idea type
 */
function rowToIdea(row: Record<string, unknown>): Idea {
  return {
    id: row.id as string,
    batch_id: row.batch_id as string,
    title: row.title as string,
    description: row.description as string,
    category: row.category as string,
    skill: row.skill as string,
    tags: parseJsonArray(row.tags as string | null),
    extended_description: row.extended_description as string | null,
    fun_facts: parseJsonArray(row.fun_facts as string | null),
    suggested_activities: parseJsonArray(row.suggested_activities as string | null),
    coloring_tips: parseJsonArray(row.coloring_tips as string | null),
    therapeutic_benefits: parseJsonArray(row.therapeutic_benefits as string | null),
    meta_keywords: parseJsonArray(row.meta_keywords as string | null),
    status: row.status as Idea['status'],
    dedupe_hash: row.dedupe_hash as string,
    image_path: row.image_path as string | null | undefined,
    selected_attempt_id: row.selected_attempt_id as string | null | undefined, 
    ignore_duplicates: row.ignore_duplicates as number | boolean | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// =============================================================================
// Input Normalization - Handle various input formats
// =============================================================================

/**
 * Parse a value that might be a comma-separated string into an array
 */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) {
    // Handle newline-separated (for fun_facts, etc.) or comma-separated
    if (value.includes('\n')) {
      return value.split('\n').map(s => s.trim()).filter(Boolean);
    }
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Normalize input from various formats (camelCase, comma-strings) to schema format
 */
function normalizeIdeaInput(raw: Record<string, unknown>): Record<string, unknown> {
  // Normalize skill: Hard → Detailed
  let skill = raw.skill as string;
  if (skill === 'Hard') {
    skill = 'Detailed';
  }
  
  return {
    title: raw.title,
    description: raw.description,
    category: raw.category,
    skill,
    tags: toStringArray(raw.tags),
    extended_description: raw.extendedDescription ?? raw.extended_description,
    fun_facts: toStringArray(raw.funFacts ?? raw.fun_facts),
    suggested_activities: toStringArray(raw.suggestedActivities ?? raw.suggested_activities),
    coloring_tips: toStringArray(raw.coloringTips ?? raw.coloring_tips),
    therapeutic_benefits: toStringArray(raw.therapeuticBenefits ?? raw.therapeutic_benefits),
    meta_keywords: toStringArray(raw.metaKeywords ?? raw.meta_keywords),
  };
}

// =============================================================================
// Handlers
// =============================================================================

export function registerIdeasHandlers(): void {
  // Import JSON array
  ipcMain.handle(IPC_CHANNELS.IDEAS_IMPORT, async (_event, jsonString: unknown) => {
    try {
      // Validate input is a string
      if (typeof jsonString !== 'string') {
        return errorResponse('Input must be a JSON string');
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        return errorResponse('Invalid JSON format');
      }

      // Normalize input array (handle camelCase and comma-separated strings)
      if (!Array.isArray(parsed)) {
        return errorResponse('Input must be an array');
      }
      const normalizedInput = parsed.map((item: Record<string, unknown>) => normalizeIdeaInput(item));

      // Validate against schema
      const validation = IdeaArraySchema.safeParse(normalizedInput);
      if (!validation.success) {
        const errors = validation.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        return errorResponse(`Validation failed: ${JSON.stringify(errors)}`);
      }

      const ideas = validation.data;
      if (ideas.length === 0) {
        return errorResponse('Array is empty');
      }

      const db = getDatabase();
      const now = new Date().toISOString();
      const batchId = ulid();

      // Create batch
      db.prepare(`
        INSERT INTO batches (id, name, imported_at, item_count, raw_source)
        VALUES (?, ?, ?, ?, ?)
      `).run(batchId, `Import ${now}`, now, ideas.length, jsonString);

      // Insert ideas
      const insertIdea = db.prepare(`
        INSERT INTO ideas (
          id, batch_id, title, description, category, skill, tags,
          extended_description, fun_facts, suggested_activities,
          coloring_tips, therapeutic_benefits, meta_keywords,
          status, dedupe_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const imported: string[] = [];
      const duplicates: string[] = [];

      const insertMany = db.transaction(() => {
        for (const idea of ideas) {
          const ideaId = ulid();
          const dedupeHash = generateDedupeHash(idea);

          // Check for duplicates
          const existing = db.prepare(
            'SELECT id FROM ideas WHERE dedupe_hash = ?'
          ).get(dedupeHash) as { id: string } | undefined;

          if (existing) {
            duplicates.push(idea.title);
            continue;
          }

          insertIdea.run(
            ideaId,
            batchId,
            idea.title,
            idea.description,
            idea.category,
            idea.skill,
            idea.tags ? JSON.stringify(idea.tags) : null,
            idea.extended_description || null,
            idea.fun_facts ? JSON.stringify(idea.fun_facts) : null,
            idea.suggested_activities ? JSON.stringify(idea.suggested_activities) : null,
            idea.coloring_tips ? JSON.stringify(idea.coloring_tips) : null,
            idea.therapeutic_benefits ? JSON.stringify(idea.therapeutic_benefits) : null,
            idea.meta_keywords ? JSON.stringify(idea.meta_keywords) : null,
            'Imported',
            dedupeHash,
            now,
            now
          );

          imported.push(ideaId);
        }
      });

      insertMany();

      log.info(`Imported ${imported.length} ideas, ${duplicates.length} duplicates skipped`);

      return successResponse({
        batchId,
        imported: imported.length,
        duplicates: duplicates.length,
        duplicateTitles: duplicates.slice(0, 10), // Return first 10 for UI
      });
    } catch (error) {
      log.error('Error importing ideas:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // List ideas with filters
  ipcMain.handle(IPC_CHANNELS.IDEAS_LIST, async (_event, filters: unknown) => {
    try {
      const validated = validateIpcPayload(ListFiltersSchema, filters, 'ideas:list');
      const db = getDatabase();

      // Build query dynamically
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (validated.status && validated.status.length > 0) {
        conditions.push(`status IN (${validated.status.map(() => '?').join(', ')})`);
        params.push(...validated.status);
      }

      if (validated.category && validated.category.length > 0) {
        conditions.push(`category IN (${validated.category.map(() => '?').join(', ')})`);
        params.push(...validated.category);
      }

      if (validated.skill && validated.skill.length > 0) {
        conditions.push(`skill IN (${validated.skill.map(() => '?').join(', ')})`);
        params.push(...validated.skill);
      }

      if (validated.batchId) {
        conditions.push('batch_id = ?');
        params.push(validated.batchId);
      }

      if (validated.search) {
        conditions.push('(title LIKE ? OR description LIKE ?)');
        const searchPattern = `%${validated.search}%`;
        params.push(searchPattern, searchPattern);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = validated.limit || 100;
      const offset = validated.offset || 0;

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM ideas ${whereClause}`;
      const { count: total } = db.prepare(countQuery).get(...params) as { count: number };

      // Get ideas
      const query = `
        SELECT ideas.*, 
        COALESCE(
          (SELECT image_path FROM generation_attempts WHERE id = ideas.selected_attempt_id),
          (SELECT image_path FROM generation_attempts WHERE idea_id = ideas.id ORDER BY created_at DESC LIMIT 1)
        ) as image_path
        FROM ideas 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      const rows = db.prepare(query).all(...params, limit, offset) as Record<string, unknown>[];

      const ideas = rows.map(rowToIdea);

      return successResponse({
        ideas,
        total,
        limit,
        offset,
      });
    } catch (error) {
      log.error('Error listing ideas:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Get idea by ID
  ipcMain.handle(IPC_CHANNELS.IDEAS_GET_BY_ID, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') {
        return errorResponse('ID must be a string');
      }

      const db = getDatabase();
      const row = db.prepare(`
        SELECT ideas.*, 
        COALESCE(
          (SELECT image_path FROM generation_attempts WHERE id = ideas.selected_attempt_id),
          (SELECT image_path FROM generation_attempts WHERE idea_id = ideas.id ORDER BY created_at DESC LIMIT 1)
        ) as image_path
        FROM ideas WHERE id = ?
      `).get(id) as Record<string, unknown> | undefined;

      if (!row) {
        return errorResponse('Idea not found', 'NOT_FOUND');
      }

      return successResponse(rowToIdea(row));
    } catch (error) {
      log.error('Error getting idea:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Get attempts for idea
  ipcMain.handle(IPC_CHANNELS.IDEAS_GET_ATTEMPTS, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') {
        return errorResponse('ID must be a string');
      }

      const db = getDatabase();
      const attempts = db.prepare(`
        SELECT * FROM generation_attempts 
        WHERE idea_id = ? 
        ORDER BY created_at DESC
      `).all(id);

      return successResponse(attempts);
    } catch (error) {
      log.error('Error getting attempts:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Set selected version
  ipcMain.handle(IPC_CHANNELS.IDEAS_SET_VERSION, async (_event, payload: unknown) => {
    try {
      const { ideaId, attemptId } = validateIpcPayload(SetVersionSchema, payload, 'ideas:set-version');
      
      const db = getDatabase();
      const result = db.prepare(`
        UPDATE ideas SET selected_attempt_id = ? WHERE id = ?
      `).run(attemptId, ideaId);

      if (result.changes === 0) {
        return errorResponse('Idea not found', 'NOT_FOUND');
      }

      return successResponse({ updated: true });
    } catch (error) {
      log.error('Error setting version:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Update idea fields
  ipcMain.handle(IPC_CHANNELS.IDEAS_UPDATE_FIELDS, async (_event, payload: unknown) => {
    try {
      const { id, fields } = validateIpcPayload(UpdateFieldsSchema, payload, 'ideas:update-fields');

      const db = getDatabase();
      const now = new Date().toISOString();

      // Build update query
      const updates: string[] = ['updated_at = ?'];
      const params: unknown[] = [now];

      if (fields.status !== undefined) {
        updates.push('status = ?');
        params.push(fields.status);
      }
      if (fields.title !== undefined) {
        updates.push('title = ?');
        params.push(fields.title);
      }
      if (fields.description !== undefined) {
        updates.push('description = ?');
        params.push(fields.description);
      }
      if (fields.category !== undefined) {
        updates.push('category = ?');
        params.push(fields.category);
      }
      if (fields.skill !== undefined) {
        updates.push('skill = ?');
        params.push(fields.skill);
      }
      if (fields.ignore_duplicates !== undefined) {
        updates.push('ignore_duplicates = ?');
        // Convert boolean to integer for SQLite if needed, but better-sqlite3 handles boolean as 0/1 automatically if typed? 
        // Actually SQLite stores boolean as 0/1. better-sqlite3 automatically converts JS boolean to 1/0? No, usually need to cast.
        // Let's assume input can be boolean or number.
        params.push(fields.ignore_duplicates === true ? 1 : fields.ignore_duplicates === false ? 0 : fields.ignore_duplicates);
      }

      params.push(id);

      const result = db.prepare(`
        UPDATE ideas SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);

      if (result.changes === 0) {
        return errorResponse('Idea not found', 'NOT_FOUND');
      }

      return successResponse({ updated: true });
    } catch (error) {
      log.error('Error updating idea:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Delete idea
  ipcMain.handle(IPC_CHANNELS.IDEAS_DELETE, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') {
        return errorResponse('ID must be a string');
      }

      const db = getDatabase();
      const result = db.prepare('DELETE FROM ideas WHERE id = ?').run(id);

      if (result.changes === 0) {
        return errorResponse('Idea not found', 'NOT_FOUND');
      }

      return successResponse({ deleted: true });
    } catch (error) {
      log.error('Error deleting idea:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Set status for multiple ideas
  ipcMain.handle(IPC_CHANNELS.IDEAS_SET_STATUS, async (_event, payload: unknown) => {
    try {
      const schema = z.object({
        ids: z.array(z.string()),
        status: IdeaStatusSchema,
      });
      const { ids, status } = validateIpcPayload(schema, payload, 'ideas:set-status');

      const db = getDatabase();
      const now = new Date().toISOString();

      const updateStmt = db.prepare(`
        UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?
      `);

      const updateMany = db.transaction(() => {
        for (const id of ids) {
          updateStmt.run(status, now, id);
        }
      });

      updateMany();

      return successResponse({ updated: ids.length });
    } catch (error) {
      log.error('Error setting status:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  /**
   * Find potential duplicates
   */
  ipcMain.handle(IPC_CHANNELS.IDEAS_FIND_DUPLICATES, async () => {
    try {
      const db = getDatabase();
      // Get all ideas
      const ideas = db.prepare(`
        SELECT 
          id, title, description, status, embedding, created_at,
          (SELECT image_path FROM generation_attempts WHERE idea_id = ideas.id ORDER BY created_at DESC LIMIT 1) as image_path 
        FROM ideas
        WHERE ignore_duplicates = 0 OR ignore_duplicates IS NULL
      `).all() as { 
        id: string; title: string; description: string; status: string; embedding: Buffer | null; created_at: string; image_path?: string 
      }[];
      
      if (ideas.length === 0) {
        return successResponse([]);
      }

      // Generate embeddings and update DB
      const updateStmt = db.prepare('UPDATE ideas SET embedding = ? WHERE id = ?');
      let generatedCount = 0;

      for (const idea of ideas) {
        if (!idea.embedding) {
          try {
            // Combine title and description for richer context
            const text = `${idea.title} ${idea.description || ''}`;
            const vector = await getEmbedding(text);
            
            // Store as Buffer (blob)
            const buffer = Buffer.from(vector.buffer);
            updateStmt.run(buffer, idea.id);
            
            // Update in-memory object
            idea.embedding = buffer;
            generatedCount++;
          } catch (err) {
            log.error(`Failed to generate embedding for idea ${idea.id}:`, err);
          }
        }
      }
      
      if (generatedCount > 0) {
        log.info(`Generated embeddings for ${generatedCount} ideas`);
      }

      // Find groups with > 0.85 cosine similarity
      const groups: any[][] = [];
      const processed = new Set<string>();

      for (let i = 0; i < ideas.length; i++) {
        const ideaA = ideas[i];
        if (processed.has(ideaA.id) || !ideaA.embedding) continue;

        const currentGroup = [{
          id: ideaA.id,
          title: ideaA.title,
          status: ideaA.status,
          created_at: ideaA.created_at,
          image_path: ideaA.image_path
        }];
        processed.add(ideaA.id);

        const vecA = new Float32Array(
          ideaA.embedding.buffer, 
          ideaA.embedding.byteOffset, 
          ideaA.embedding.byteLength / 4
        );

        for (let j = i + 1; j < ideas.length; j++) {
           const ideaB = ideas[j];
           if (processed.has(ideaB.id) || !ideaB.embedding) continue;

           const vecB = new Float32Array(
             ideaB.embedding.buffer, 
             ideaB.embedding.byteOffset, 
             ideaB.embedding.byteLength / 4
           );

           const similarity = cosineSimilarity(vecA, vecB);
           
           // Threshold 0.82 is usually appropriate for Sentence Transformers semantic match
           if (similarity > 0.82) {
             currentGroup.push({
                id: ideaB.id,
                title: ideaB.title,
                status: ideaB.status,
                created_at: ideaB.created_at,
                image_path: ideaB.image_path
             });
             processed.add(ideaB.id);
           }
        }

        if (currentGroup.length > 1) {
          groups.push(currentGroup);
        }
      }
      
      // Sort groups by size
      groups.sort((a, b) => b.length - a.length);
      
      return successResponse(groups);
    } catch (error) {
      log.error('Error finding duplicates:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}
