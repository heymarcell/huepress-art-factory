
import { pipeline, env } from '@huggingface/transformers';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';

// Configure cache directory to userData
env.cacheDir = path.join(app.getPath('userData'), 'models');
env.allowLocalModels = false; // Force download from Hub initially

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

/**
 * Initialize the embedding model
 */
export async function initEmbeddingModel() {
  if (!extractor) {
    try {
      log.info('Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
      });
      log.info('Embedding model loaded successfully');
    } catch (error) {
      log.error('Failed to load embedding model:', error);
      throw error;
    }
  }
  return extractor;
}

/**
 * Generate embedding for a text string
 * Returns a 384-dimensional Float32Array
 */
export async function getEmbedding(text: string): Promise<Float32Array> {
  if (!extractor) await initEmbeddingModel();

  // Normalize text
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (!cleanText) return new Float32Array(384);

  const output = await extractor(cleanText, { pooling: 'mean', normalize: true });
  return output.data;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}
