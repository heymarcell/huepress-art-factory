import type { Idea } from '../../shared/schemas';
import styles from './IdeaDetail.module.css';

interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  onStatusChange?: (status: Idea['status']) => void;
}

const STATUS_OPTIONS: Idea['status'][] = [
  'Imported',
  'Queued',
  'Generated',
  'NeedsAttention',
  'Approved',
  'Exported',
];

export function IdeaDetail({ idea, onClose, onStatusChange }: IdeaDetailProps) {
  const handleStatusChange = (newStatus: Idea['status']) => {
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{idea.title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className={styles.content}>
          {/* Status and Skill */}
          <div className={styles.badges}>
            <select
              className={styles.statusSelect}
              value={idea.status}
              onChange={(e) => handleStatusChange(e.target.value as Idea['status'])}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <span className={styles.skillBadge}>{idea.skill}</span>
            <span className={styles.categoryBadge}>{idea.category}</span>
          </div>

          {/* Description */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Description</h3>
            <p className={styles.description}>{idea.description}</p>
          </section>

          {/* Extended Description */}
          {idea.extended_description && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Extended Description</h3>
              <p className={styles.text}>{idea.extended_description}</p>
            </section>
          )}

          {/* Tags */}
          {idea.tags && idea.tags.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Tags</h3>
              <div className={styles.tags}>
                {idea.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Fun Facts */}
          {idea.fun_facts && idea.fun_facts.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Fun Facts</h3>
              <ul className={styles.list}>
                {idea.fun_facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Coloring Tips */}
          {idea.coloring_tips && idea.coloring_tips.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Coloring Tips</h3>
              <ul className={styles.list}>
                {idea.coloring_tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Suggested Activities */}
          {idea.suggested_activities && idea.suggested_activities.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Suggested Activities</h3>
              <ul className={styles.list}>
                {idea.suggested_activities.map((activity, i) => (
                  <li key={i}>{activity}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Therapeutic Benefits */}
          {idea.therapeutic_benefits && idea.therapeutic_benefits.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Therapeutic Benefits</h3>
              <ul className={styles.list}>
                {idea.therapeutic_benefits.map((benefit, i) => (
                  <li key={i}>{benefit}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Meta Keywords */}
          {idea.meta_keywords && idea.meta_keywords.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Meta Keywords</h3>
              <div className={styles.keywords}>
                {idea.meta_keywords.map((keyword) => (
                  <span key={keyword} className={styles.keyword}>
                    {keyword}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Metadata */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Metadata</h3>
            <div className={styles.metadata}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>ID</span>
                <code className={styles.metaValue}>{idea.id}</code>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Batch</span>
                <code className={styles.metaValue}>{idea.batch_id}</code>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Created</span>
                <span className={styles.metaValue}>
                  {new Date(idea.created_at).toLocaleString()}
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Updated</span>
                <span className={styles.metaValue}>
                  {new Date(idea.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <footer className={styles.footer}>
          <button className={styles.actionButton} disabled title="Available in M2">
            🎨 Generate Image
          </button>
          <button
            className={`${styles.actionButton} ${styles.approveButton}`}
            onClick={() => handleStatusChange('Approved')}
            disabled={idea.status === 'Approved'}
          >
            ✓ Approve
          </button>
        </footer>
      </div>
    </div>
  );
}
