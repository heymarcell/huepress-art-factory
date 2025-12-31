import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './Settings.module.css';

export function Settings() {
  const queryClient = useQueryClient();
  const [apiKeyInput, setApiKeyInput] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await window.huepress.settings.get();
      return result.success ? result.data : null;
    },
  });

  const { data: apiKeyStatus } = useQuery({
    queryKey: ['api-key-status'],
    queryFn: async () => {
      const result = await window.huepress.settings.getApiKeyStatus();
      return result.success ? result.data : null;
    },
  });

  const { data: versionInfo } = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const result = await window.huepress.app.getVersion();
      return result.success ? result.data : null;
    },
  });

  const { data: projectInfo } = useQuery({
    queryKey: ['project-info'],
    queryFn: async () => {
      const result = await window.huepress.app.getProjectInfo();
      return result.success ? result.data : null;
    },
  });

  const saveApiKey = useMutation({
    mutationFn: async (key: string) => {
      const result = await window.huepress.settings.setApiKey(key);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-key-status'] });
      setApiKeyInput('');
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const result = await window.huepress.settings.set(updates);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      saveApiKey.mutate(apiKeyInput.trim());
    }
  };

  return (
    <div className={styles.settings}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>
          Configure your HuePress Art Factory
        </p>
      </header>

      {/* API Configuration */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>API Configuration</h2>
        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Gemini API Key</label>
            <p className={styles.hint}>
              Required for image generation. Get your API key from{' '}
              <a
                href="https://ai.google.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google AI Studio
              </a>
            </p>
            <div className={styles.apiKeyStatus}>
              {apiKeyStatus?.hasApiKey ? (
                <span className={styles.statusOk}>
                  ✓ API key configured
                  {apiKeyStatus.isEncrypted && ' (encrypted)'}
                </span>
              ) : (
                <span className={styles.statusMissing}>✗ API key not set</span>
              )}
            </div>
            <div className={styles.inputGroup}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter your Gemini API key..."
                className={styles.input}
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || saveApiKey.isPending}
                className={styles.button}
              >
                {saveApiKey.isPending ? 'Saving...' : 'Save Key'}
              </button>
            </div>
            {saveApiKey.isSuccess && (
              <p className={styles.successMessage}>API key saved successfully!</p>
            )}
            {saveApiKey.isError && (
              <p className={styles.errorMessage}>
                Failed to save API key: {(saveApiKey.error as Error).message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Generation Settings */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Generation Settings</h2>
        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Concurrency</label>
            <p className={styles.hint}>
              Number of simultaneous image generation jobs (1-10)
            </p>
            <input
              type="number"
              min={1}
              max={10}
              value={settings?.concurrency || 3}
              onChange={(e) =>
                updateSettings.mutate({ concurrency: parseInt(e.target.value) })
              }
              className={styles.inputSmall}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Prompt Template Version</label>
            <p className={styles.hint}>
              Current template version used for generation
            </p>
            <input
              type="text"
              value={settings?.promptTemplateVersion || 'v1.0.0'}
              disabled
              className={styles.inputSmall}
            />
          </div>
        </div>
      </section>

      {/* Theme */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Theme</label>
            <div className={styles.themeOptions}>
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => updateSettings.mutate({ theme })}
                  className={`${styles.themeOption} ${
                    settings?.theme === theme ? styles.themeOptionActive : ''
                  }`}
                  disabled // Dark theme only for now
                >
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              Only dark theme is available in this version
            </p>
          </div>
        </div>
      </section>

      {/* About */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>About</h2>
        <div className={styles.card}>
          <div className={styles.aboutGrid}>
            <div className={styles.aboutItem}>
              <span className={styles.aboutLabel}>Version</span>
              <span className={styles.aboutValue}>{versionInfo?.version || '—'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.aboutLabel}>Electron</span>
              <span className={styles.aboutValue}>{versionInfo?.electron || '—'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.aboutLabel}>Node</span>
              <span className={styles.aboutValue}>{versionInfo?.node || '—'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.aboutLabel}>Chrome</span>
              <span className={styles.aboutValue}>{versionInfo?.chrome || '—'}</span>
            </div>
          </div>
          <hr className={styles.divider} />
          <div className={styles.paths}>
            <div className={styles.pathItem}>
              <span className={styles.pathLabel}>Database</span>
              <code className={styles.pathValue}>{projectInfo?.databasePath || '—'}</code>
            </div>
            <div className={styles.pathItem}>
              <span className={styles.pathLabel}>Assets</span>
              <code className={styles.pathValue}>{projectInfo?.assetsPath || '—'}</code>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
