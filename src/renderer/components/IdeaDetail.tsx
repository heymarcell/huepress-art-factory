import { X, Palette, Check, Tag, Lightbulb, Heart, FileText, Trash2 } from 'lucide-react';
import type { Idea } from '../../shared/schemas';
import styles from './IdeaDetail.module.css';

interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  onStatusChange?: (status: Idea['status']) => void;
  onDelete?: () => void;
}

const STATUS_OPTIONS: Idea['status'][] = [
  'Imported',
  'Queued',
  'Generated',
  'NeedsAttention',
  'Approved',
  'Exported',
];

export function IdeaDetail({ idea, onClose, onStatusChange, onDelete }: IdeaDetailProps) {
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
            <X size={18} />
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
            <div className={styles.sectionHeader}>
              <FileText size={14} />
              <h3>Description</h3>
            </div>
            <p className={styles.description}>{idea.description}</p>
          </section>

          {/* Extended Description */}
          {idea.extended_description && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <FileText size={14} />
                <h3>Extended Description</h3>
              </div>
              <p className={styles.text}>{idea.extended_description}</p>
            </section>
          )}

          {/* Tags */}
          {idea.tags && idea.tags.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Tag size={14} />
                <h3>Tags</h3>
              </div>
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
              <div className={styles.sectionHeader}>
                <Lightbulb size={14} />
                <h3>Fun Facts</h3>
              </div>
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
              <div className={styles.sectionHeader}>
                <Palette size={14} />
                <h3>Coloring Tips</h3>
              </div>
              <ul className={styles.list}>
                {idea.coloring_tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Therapeutic Benefits */}
          {idea.therapeutic_benefits && idea.therapeutic_benefits.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Heart size={14} />
                <h3>Therapeutic Benefits</h3>
              </div>
              <ul className={styles.list}>
                {idea.therapeutic_benefits.map((benefit, i) => (
                  <li key={i}>{benefit}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Metadata */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Metadata</h3>
            </div>
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
          <button className={styles.actionButton} disabled title="Coming in M2">
            <Palette size={14} />
            Generate
          </button>
          <button
            className={`${styles.actionButton} ${styles.approveButton}`}
            onClick={() => handleStatusChange('Approved')}
            disabled={idea.status === 'Approved'}
          >
            <Check size={14} />
            Approve
          </button>
          {onDelete && (
            <button className={styles.deleteButton} onClick={onDelete}>
              <Trash2 size={14} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
