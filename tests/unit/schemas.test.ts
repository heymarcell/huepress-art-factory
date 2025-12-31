/**
 * Unit tests for HuePress Art Factory
 * 
 * Test categories (to be implemented):
 * - Schema validation (Zod)
 * - Database migrations
 * - IPC payload validation
 * - Path sanitization
 * - Dedupe hash generation
 */

import { describe, it, expect } from 'vitest';
import { IdeaInputSchema, IdeaArraySchema, IdeaStatusSchema } from '../../src/shared/schemas';

describe('IdeaInputSchema', () => {
  it('validates a valid idea object', () => {
    const validIdea = {
      title: 'Test Title',
      description: 'Test description for the coloring page',
      category: 'Animals',
      skill: 'Easy',
    };

    const result = IdeaInputSchema.safeParse(validIdea);
    expect(result.success).toBe(true);
  });

  it('rejects an idea with missing title', () => {
    const invalidIdea = {
      description: 'Test description',
      category: 'Animals',
      skill: 'Easy',
    };

    const result = IdeaInputSchema.safeParse(invalidIdea);
    expect(result.success).toBe(false);
  });

  it('rejects an idea with invalid skill level', () => {
    const invalidIdea = {
      title: 'Test Title',
      description: 'Test description',
      category: 'Animals',
      skill: 'SuperHard', // Invalid
    };

    const result = IdeaInputSchema.safeParse(invalidIdea);
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const ideaWithOptionals = {
      title: 'Test Title',
      description: 'Test description',
      category: 'Animals',
      skill: 'Medium',
      tags: ['cute', 'animals'],
      fun_facts: ['Fact 1', 'Fact 2'],
    };

    const result = IdeaInputSchema.safeParse(ideaWithOptionals);
    expect(result.success).toBe(true);
  });
});

describe('IdeaArraySchema', () => {
  it('validates an array of ideas', () => {
    const ideas = [
      {
        title: 'Idea 1',
        description: 'Description 1',
        category: 'Animals',
        skill: 'Easy',
      },
      {
        title: 'Idea 2',
        description: 'Description 2',
        category: 'Nature',
        skill: 'Detailed',
      },
    ];

    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(true);
  });

  it('rejects non-array input', () => {
    const notAnArray = { title: 'Test' };
    const result = IdeaArraySchema.safeParse(notAnArray);
    expect(result.success).toBe(false);
  });
});

describe('IdeaStatusSchema', () => {
  it('accepts valid status values', () => {
    const validStatuses = ['Imported', 'Queued', 'Generated', 'NeedsAttention', 'Approved', 'Exported'];

    validStatuses.forEach((status) => {
      const result = IdeaStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid status values', () => {
    const result = IdeaStatusSchema.safeParse('InvalidStatus');
    expect(result.success).toBe(false);
  });
});
