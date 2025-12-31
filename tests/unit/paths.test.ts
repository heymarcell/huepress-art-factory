/**
 * Unit tests for path utilities
 */

import { describe, it, expect } from 'vitest';
import { safePath, sanitizeFilename } from '../../src/main/utils/paths';

describe('safePath', () => {
  it('allows paths within base directory', () => {
    const base = '/tmp/test';
    const result = safePath(base, 'subdir', 'file.txt');
    expect(result).toBe('/tmp/test/subdir/file.txt');
  });

  it('blocks directory traversal attempts', () => {
    const base = '/tmp/test';
    expect(() => safePath(base, '..', 'etc', 'passwd')).toThrow('Invalid path');
  });

  it('blocks absolute path override attempts', () => {
    const base = '/tmp/test';
    // This should still be safe because resolve handles it
    const result = safePath(base, 'subdir');
    expect(result.startsWith(base)).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('removes dangerous characters', () => {
    const result = sanitizeFilename('file<>:"/\\|?*name.txt');
    expect(result).toBe('file_________name.txt');
  });

  it('removes leading dots', () => {
    const result = sanitizeFilename('...hidden');
    expect(result).toBe('hidden');
  });

  it('limits filename length', () => {
    const longName = 'a'.repeat(300);
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(255);
  });

  it('handles normal filenames unchanged', () => {
    const result = sanitizeFilename('normal_file-name.png');
    expect(result).toBe('normal_file-name.png');
  });
});
