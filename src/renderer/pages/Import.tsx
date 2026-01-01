import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, FileJson, Info } from 'lucide-react';
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    count: number;
    errors: { path: string; message: string }[];
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (json: string) => {
      // ... same
      const result = await window.huepress.ideas.importJsonArray(json);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      
      // Navigate to library and trigger duplicate check
      // Allow slight delay for invalidation to propagate? No need.
      navigate('/library', { 
        state: { 
          autoCheckDuplicates: true,
          importCount: data.imported 
        } 
      });
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
            message: `Must be Easy, Medium, or Detailed`,
          });
        }
      });

      setValidationResult({
        valid: errors.length === 0,
        count: parsed.length,
        errors: errors.slice(0, 10),
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
        <h1 className={styles.title}>Import Ideas</h1>
        <p className={styles.subtitle}>Paste a JSON array of coloring page ideas</p>
      </header>

      {/* Success message */}
      {importMutation.isSuccess && (
        <div className={styles.success}>
          <CheckCircle size={16} />
          <div>
            <strong>Import successful</strong>
            <span>
              {importMutation.data?.imported} imported
              {importMutation.data?.duplicates > 0 &&
                `, ${importMutation.data.duplicates} duplicates skipped`}
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {importMutation.isError && (
        <div className={styles.error}>
          <XCircle size={16} />
          <div>
            <strong>Import failed</strong>
            <span>{(importMutation.error as Error).message}</span>
          </div>
        </div>
      )}

      {/* JSON Input */}
      <div className={styles.inputSection}>
        <div className={styles.inputHeader}>
          <div className={styles.labelGroup}>
            <FileJson size={14} />
            <span>JSON Array</span>
          </div>
          <button onClick={handleLoadSample} className={styles.sampleButton}>
            Load Sample
          </button>
        </div>
        <textarea
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
            <>
              <CheckCircle size={16} />
              <span>{validationResult.count} items ready to import</span>
            </>
          ) : (
            <>
              <XCircle size={16} />
              <div className={styles.errorList}>
                {validationResult.errors.map((err, i) => (
                  <div key={i} className={styles.errorItem}>
                    {err.path && <code>{err.path}</code>}
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button
          onClick={handleValidate}
          className={styles.btnSecondary}
          disabled={!jsonInput.trim()}
        >
          Validate
        </button>
        <button
          onClick={handleImport}
          className={styles.btnPrimary}
          disabled={!validationResult?.valid || importMutation.isPending}
        >
          {importMutation.isPending ? 'Importing...' : 'Import'}
        </button>
      </div>

      {/* Schema Reference */}
      <details className={styles.schemaRef}>
        <summary>
          <Info size={14} />
          <span>Schema Reference</span>
        </summary>
        <div className={styles.schemaContent}>
          <div className={styles.schemaSection}>
            <h4>Required Fields</h4>
            <ul>
              <li><code>title</code> - string (1-200 chars)</li>
              <li><code>description</code> - string (1-2000 chars)</li>
              <li><code>category</code> - string (1-100 chars)</li>
              <li><code>skill</code> - "Easy" | "Medium" | "Detailed" | "Hard"</li>
            </ul>
          </div>
          <div className={styles.schemaSection}>
            <h4>Optional Fields</h4>
            <ul>
              <li><code>tags</code> - string[]</li>
              <li><code>fun_facts</code> - string[]</li>
              <li><code>coloring_tips</code> - string[]</li>
              <li><code>therapeutic_benefits</code> - string[]</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
