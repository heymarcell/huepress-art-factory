import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Folder,
  Sliders,
  Info,
  CheckCircle,
  AlertCircle,
  Save,
} from 'lucide-react';
import styles from './Settings.module.css';

export function Settings() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');

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
    staleTime: Infinity,
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const result = await window.huepress.settings.setApiKey(key);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-key-status'] });
      setApiKey('');
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const result = await window.huepress.settings.set(updates);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      saveApiKeyMutation.mutate(apiKey.trim());
    }
  };

  const [webApiKey, setWebApiKey] = useState('');

  const saveWebApiKeyMutation = useMutation({
    mutationFn: async (key: string) => {
       // Invoke the new channel
       const result = await window.huepress.settings.setWebApiKey(key);
       if (!result.success) throw new Error(result.error);
       return result.data;
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['api-key-status'] });
       setWebApiKey('');
    }
  });

  return (
    <div className={styles.settings}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Configure application preferences</p>
      </header>

      {/* API Key Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Key size={16} />
          <h2>Gemini API Key</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.statusRow}>
            <span className={styles.label}>Status</span>
            {apiKeyStatus?.hasApiKey ? (
              <span className={styles.statusOk}>
                <CheckCircle size={14} />
                Configured
              </span>
            ) : (
              <span className={styles.statusError}>
                <AlertCircle size={14} />
                Not configured
              </span>
            )}
          </div>
          <div className={styles.inputGroup}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyStatus?.hasApiKey ? '••••••••••••••••' : 'Enter API key'}
              className={styles.input}
            />
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim() || saveApiKeyMutation.isPending}
              className={styles.btnPrimary}
            >
              <Save size={14} />
              {saveApiKeyMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
          {saveApiKeyMutation.isSuccess && (
            <p className={styles.successText}>API key saved successfully</p>
          )}
          {saveApiKeyMutation.isError && (
            <p className={styles.errorText}>
              {(saveApiKeyMutation.error as Error).message}
            </p>
          )}
        </div>
      </section>

      {/* Web API Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Key size={16} />
          <h2>Web API Configuration</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.label}>Server URL</span>
              <span className={styles.hint}>HuePress Web API Endpoint</span>
            </div>
            <input
              type="text"
              value={settings?.webApiUrl || 'https://api.huepress.co'}
              onChange={(e) =>
                updateSettingsMutation.mutate({ webApiUrl: e.target.value })
              }
              className={styles.input}
              style={{ width: '240px' }}
            />
          </div>

          <div className={styles.statusRow} style={{ marginTop: '16px' }}>
             <span className={styles.label}>Admin Key</span>
             {apiKeyStatus?.hasWebApiKey ? ( // Checking property added in step 1064, wait... types might complain if I didn't update schema in settings.ts fully, but I did update return object.
               <span className={styles.statusOk}>
                 <CheckCircle size={14} />
                 Configured
               </span>
             ) : (
               <span className={styles.statusError} style={{ color: '#fbbf24' }}>
                 <AlertCircle size={14} />
                 Not Configured
               </span>
             )}
          </div>
          <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
            <input
              type="password"
              value={webApiKey}
              onChange={(e) => setWebApiKey(e.target.value)} 
              placeholder="Enter Admin API Key"
              className={styles.input}
            />
            <button
               onClick={() => {
                 if (webApiKey.trim()) saveWebApiKeyMutation.mutate(webApiKey.trim());
               }}
               disabled={!webApiKey.trim() || saveWebApiKeyMutation.isPending}
               className={styles.btnPrimary}
            >
               <Save size={14} />
               {saveWebApiKeyMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* Vectorizer API Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sliders size={16} />
          <h2>Vectorizer API</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.label}>API URL</span>
              <span className={styles.hint}>External image-to-SVG service</span>
            </div>
            <input
              type="text"
              value={settings?.vectorizerApiUrl || 'http://localhost:8000'}
              onChange={(e) =>
                updateSettingsMutation.mutate({ vectorizerApiUrl: e.target.value })
              }
              className={styles.input}
              style={{ width: '240px' }}
            />
          </div>
        </div>
      </section>

      {/* Generation Settings */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sliders size={16} />
          <h2>Generation</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.label}>Concurrency</span>
              <span className={styles.hint}>Parallel jobs (1-10)</span>
            </div>
            <select
              value={settings?.concurrency || 3}
              onChange={(e) =>
                updateSettingsMutation.mutate({ concurrency: parseInt(e.target.value) })
              }
              className={styles.select}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.label}>Prompt Template</span>
              <span className={styles.hint}>Template version to use</span>
            </div>
            <span className={styles.value}>
              {settings?.promptTemplateVersion || 'v1.0.0'}
            </span>
          </div>
        </div>
      </section>

      {/* Paths */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Folder size={16} />
          <h2>Storage Paths</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.pathRow}>
            <span className={styles.label}>Database</span>
            <code className={styles.pathValue}>./dev-data/huepress.db</code>
          </div>
          <div className={styles.pathRow}>
            <span className={styles.label}>Assets</span>
            <code className={styles.pathValue}>./dev-data/assets/</code>
          </div>
          <div className={styles.pathRow}>
            <span className={styles.label}>Exports</span>
            <code className={styles.pathValue}>./dev-data/exports/</code>
          </div>
        </div>
      </section>

      {/* About */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Info size={16} />
          <h2>About</h2>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.aboutGrid}>
            <div className={styles.aboutItem}>
              <span className={styles.label}>App Version</span>
              <span className={styles.value}>{versionInfo?.version || '0.1.0'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.label}>Electron</span>
              <span className={styles.value}>{versionInfo?.electron || '—'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.label}>Node.js</span>
              <span className={styles.value}>{versionInfo?.node || '—'}</span>
            </div>
            <div className={styles.aboutItem}>
              <span className={styles.label}>Chromium</span>
              <span className={styles.value}>{versionInfo?.chrome || '—'}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
