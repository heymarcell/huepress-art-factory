import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './Import.module.css';

const SAMPLE_JSON = `[
  {
    "title": "Friendly Dinosaur",
    "description": "A cute T-Rex standing in a prehistoric landscape with palm trees",
    "category": "Animals",
    "skill": "Easy",
    "tags": ["dinosaur", "prehistoric", "kids"],
    "fun_facts": ["T-Rex had tiny arms but a powerful bite!"],
    "coloring_tips": ["Start with the body, then add details"]
  }
]`;

export function Import() {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    count: number;
    errors: { path: string; message: string }[];
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (json: string) => {
      const result = await window.huepress.ideas.importJsonArray(json);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setJsonInput('');
      setValidationResult(null);
    },
  });

  const handleValidate = () => {
    if (!jsonInput.trim()) {
      setValidationResult({
        valid: false,
        count: 0,
        errors: [{ path: '', message: 'Please paste a JSON array' }],
      });
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        setValidationResult({
          valid: false,
          count: 0,
          errors: [{ path: '', message: 'Input must be a JSON array []' }],
        });
        return;
      }

      // Quick validation
      const errors: { path: string; message: string }[] = [];
      const requiredFields = ['title', 'description', 'category', 'skill'];

      parsed.forEach((item, index) => {
        requiredFields.forEach((field) => {
          if (!item[field]) {
            errors.push({
              path: `[${index}].${field}`,
              message: `Missing required field`,
            });
          }
        });

        if (item.skill && !['Easy', 'Medium', 'Detailed', 'Hard'].includes(item.skill)) {
          errors.push({
            path: `[${index}].skill`,
            message: `Must be Easy, Medium, Detailed, or Hard`,
          });
        }
      });

      setValidationResult({
        valid: errors.length === 0,
        count: parsed.length,
        errors: errors.slice(0, 10), // Show first 10 errors
      });
    } catch (e) {
      setValidationResult({
        valid: false,
        count: 0,
        errors: [{ path: '', message: `Invalid JSON: ${(e as Error).message}` }],
      });
    }
  };

  const handleImport = () => {
    if (validationResult?.valid) {
      importMutation.mutate(jsonInput);
    }
  };

  const handleLoadSample = () => {
    setJsonInput(SAMPLE_JSON);
    setValidationResult(null);
  };

  return (
    <div className={styles.import}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Import Ideas</h1>
          <p className={styles.subtitle}>
            Paste a JSON array of coloring page ideas to import
          </p>
        </div>
      </header>

      {/* Success message */}
      {importMutation.isSuccess && (
        <div className={styles.success}>
          <strong>✓ Import successful!</strong>
          <p>
            Imported {importMutation.data?.imported} ideas
            {importMutation.data?.duplicates > 0 &&
              ` (${importMutation.data.duplicates} duplicates skipped)`}
          </p>
        </div>
      )}

      {/* Error message */}
      {importMutation.isError && (
        <div className={styles.error}>
          <strong>✗ Import failed</strong>
          <p>{(importMutation.error as Error).message}</p>
        </div>
      )}

      {/* JSON Input */}
      <div className={styles.inputSection}>
        <div className={styles.inputHeader}>
          <label htmlFor="json-input" className={styles.label}>
            JSON Array
          </label>
          <button
            type="button"
            onClick={handleLoadSample}
            className={styles.sampleButton}
          >
            Load Sample
          </button>
        </div>
        <textarea
          id="json-input"
          className={styles.textarea}
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setValidationResult(null);
          }}
          placeholder="Paste your JSON array here..."
          spellCheck={false}
        />
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div
          className={`${styles.validation} ${
            validationResult.valid ? styles.validationSuccess : styles.validationError
          }`}
        >
          {validationResult.valid ? (
            <div className={styles.validationContent}>
              <strong>✓ Valid JSON</strong>
              <span>{validationResult.count} items ready to import</span>
            </div>
          ) : (
            <div className={styles.validationContent}>
              <strong>✗ Validation errors</strong>
              <ul className={styles.errorList}>
                {validationResult.errors.map((err, i) => (
                  <li key={i}>
                    {err.path && <code>{err.path}</code>} {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleValidate}
          className={styles.buttonSecondary}
          disabled={!jsonInput.trim()}
        >
          Validate
        </button>
        <button
          type="button"
          onClick={handleImport}
          className={styles.buttonPrimary}
          disabled={!validationResult?.valid || importMutation.isPending}
        >
          {importMutation.isPending ? 'Importing...' : 'Import'}
        </button>
      </div>

      {/* Schema Reference */}
      <details className={styles.schemaRef}>
        <summary>Schema Reference</summary>
        <div className={styles.schemaContent}>
          <h4>Required Fields</h4>
          <ul>
            <li><code>title</code> - string (1-200 chars)</li>
            <li><code>description</code> - string (1-2000 chars)</li>
            <li><code>category</code> - string (1-100 chars)</li>
            <li><code>skill</code> - "Easy" | "Medium" | "Detailed" | "Hard"</li>
          </ul>
          <h4>Optional Fields</h4>
          <ul>
            <li><code>tags</code> - string[]</li>
            <li><code>extended_description</code> - string</li>
            <li><code>fun_facts</code> - string[]</li>
            <li><code>suggested_activities</code> - string[]</li>
            <li><code>coloring_tips</code> - string[]</li>
            <li><code>therapeutic_benefits</code> - string[]</li>
            <li><code>meta_keywords</code> - string[]</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
