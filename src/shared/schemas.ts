import { z } from "zod";

// =============================================================================
// Input Schemas (what users paste)
// =============================================================================

export const IdeaInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(2000, "Description too long"),
  category: z
    .string()
    .min(1, "Category is required")
    .max(100, "Category too long"),
  skill: z.enum(["Easy", "Medium", "Detailed"]), // 'Hard' is normalized to 'Detailed' on import
  tags: z.array(z.string().max(50)).optional(),
  extended_description: z.string().max(5000).optional(),
  fun_facts: z.array(z.string().max(500)).optional(),
  suggested_activities: z.array(z.string().max(500)).optional(),
  coloring_tips: z.array(z.string().max(500)).optional(),
  therapeutic_benefits: z.array(z.string().max(500)).optional(),
  meta_keywords: z.array(z.string().max(100)).optional(),
});

export const IdeaArraySchema = z.array(IdeaInputSchema);

export type IdeaInput = z.infer<typeof IdeaInputSchema>;

// =============================================================================
// Status Types
// =============================================================================

export const IdeaStatusSchema = z.enum([
  "Imported",
  "Queued",
  "Generating",
  "Generated",
  "NeedsAttention",
  "Failed",
  "Approved",
  "Exported",
  "Omitted",
]);

export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;

// =============================================================================
// Database Entity Types
// =============================================================================

export interface Idea {
  id: string; // ArtID (ULID)
  batch_id: string;
  title: string;
  description: string;
  category: string;
  skill: string;
  tags: string[] | null;
  extended_description: string | null;
  fun_facts: string[] | null;
  suggested_activities: string[] | null;
  coloring_tips: string[] | null;
  therapeutic_benefits: string[] | null;
  meta_keywords: string[] | null;
  status: IdeaStatus;
  dedupe_hash: string;
  image_path?: string | null;
  selected_attempt_id?: string | null;
  ignore_duplicates?: number | boolean; 
  notes?: string | null; // Manual notes for the idea
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string; // ULID
  name: string | null;
  imported_at: string;
  item_count: number;
  raw_source: string | null;
}

export interface GenerationAttempt {
  id: string; // ULID
  idea_id: string;
  type: "generate" | "edit";
  prompt_template_version: string;
  request: string; // JSON serialized
  response_meta: string | null; // JSON (model, safety, timings)
  image_path: string | null;
  image_sha256: string | null;
  qc_report: string | null; // JSON
  created_at: string;
}

export interface ExportRun {
  id: string;
  created_at: string;
  destination: string;
  items: string[]; // Array of idea IDs
  profile_name: string | null;
  result_log: string | null; // JSON
}

// =============================================================================
// Filter Types
// =============================================================================

export interface IdeaFilters {
  status?: IdeaStatus[];
  category?: string[];
  skill?: string[];
  tags?: string[];
  batchId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Job Types
// =============================================================================

export interface JobProgress {
  jobId: string;
  ideaId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  message?: string;
  error?: string;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

// =============================================================================
// Settings Types
// =============================================================================

export interface AppSettings {
  projectPath: string | null;
  assetsPath: string | null;
  exportsPath: string | null;
  concurrency: number;
  promptTemplateVersion: string;
  theme: "light" | "dark" | "system";
}

// =============================================================================
// Export Types
// =============================================================================

export interface ExportOptions {
  ideaIds: string[];
  destination: string;
  format: "png" | "tiff";
  includeSidecar: boolean;
  profileName?: string;
}

// =============================================================================
// QC Report Types
// =============================================================================

export interface QCReport {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
    severity: "error" | "warning" | "info";
  }[];
}
