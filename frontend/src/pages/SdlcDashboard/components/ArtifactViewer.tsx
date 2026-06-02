import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import type { Artifact } from '@/store/useSdlcStore';
import ReactMarkdown from 'react-markdown';
import PenpotPreview from './PenpotPreview';

interface Props {
  artifacts: Artifact[];
  selected: Artifact | null;
  onSelect: (a: Artifact | null) => void;
}

// ── Artifact type classification ────────────────────────────────────────────

/** Visual artifacts — hiển thị to đầu tiên (hero section) */
const VISUAL_TYPES = new Set([
  'wireframe_spec', 'user_flow', 'component_inventory', 'ux_spec',
]);

/** Summary cards — metric/stat compact grid */
const SUMMARY_TYPES = new Set([
  'ac_coverage_matrix', 'risk_assessment', 'qa_report',
]);



type ArtifactCategory = 'visual' | 'summary' | 'document';

function getCategory(artifact: Artifact): ArtifactCategory {
  if (VISUAL_TYPES.has(artifact.type) || artifact.phase === 'ux-agent') return 'visual';
  if (SUMMARY_TYPES.has(artifact.type)) return 'summary';
  return 'document';
}

// ── Icons & Colors ──────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  prd: '📄', user_stories: '📖', acceptance_criteria: '✅', scope: '🎯',
  ux_spec: '🎨', user_flow: '🔀', wireframe_spec: '🖼️', component_inventory: '🧩',
  implementation_plan: '🗺️', mock_code_diff: '💻', changed_files: '📂', risk_assessment: '⚠️',
  test_cases: '🧪', qa_report: '📊', ac_coverage_matrix: '📋',
};

const TYPE_LABELS: Record<string, string> = {
  prd: 'PRD', user_stories: 'User Stories', acceptance_criteria: 'Acceptance Criteria',
  scope: 'Scope', ux_spec: 'UX Spec', user_flow: 'User Flow',
  wireframe_spec: 'Wireframe', component_inventory: 'Components',
  implementation_plan: 'Impl. Plan', mock_code_diff: 'Code Diff',
  changed_files: 'Changed Files', risk_assessment: 'Risk Assessment',
  test_cases: 'Test Cases', qa_report: 'QA Report', ac_coverage_matrix: 'AC Coverage',
};

const PHASE_COLORS: Record<string, string> = {
  'po-agent': '#6366f1', 'ux-agent': '#8b5cf6',
  'dev-agent': '#3b82f6', 'qa-agent': '#10b981',
};

// ── JSON Syntax Highlight ───────────────────────────────────────────────────

function syntaxHighlight(json: string): string {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'number';
      if (/^"/.test(match)) { cls = /:$/.test(match) ? 'key' : 'string'; }
      else if (/true|false/.test(match)) cls = 'boolean';
      else if (/null/.test(match)) cls = 'null';
      const color =
        cls === 'key' ? '#9cdcfe' : cls === 'string' ? '#ce9178' :
        cls === 'number' ? '#b5cea8' : '#569cd6';
      return `<span style="color: ${color};">${match}</span>`;
    }
  );
}

// ── Accordion Document Item ─────────────────────────────────────────────────

function DocumentAccordion({ art }: { art: Artifact }) {
  const [open, setOpen] = useState(false);
  const label = TYPE_LABELS[art.type] || art.title;
  const icon = TYPE_ICONS[art.type] || '📄';

  return (
    <div className="accordion-item">
      <button
        className="accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="accordion-icon">{icon}</span>
        <span className="accordion-label">{open ? `Ẩn ${label}` : `Xem chi tiết ${label}`}</span>
        <motion.span
          className="accordion-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="accordion-body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="accordion-content">
              {art.contentText ? (
                <div className="artifact-markdown">
                  <ReactMarkdown>{art.contentText}</ReactMarkdown>
                </div>
              ) : art.contentJson ? (
                <pre
                  className="artifact-json"
                  dangerouslySetInnerHTML={{
                    __html: syntaxHighlight(JSON.stringify(art.contentJson, null, 2)),
                  }}
                />
              ) : (
                <p className="artifact-empty">No content available.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ art }: { art: Artifact }) {
  return (
    <div className="summary-card" style={{ '--phase-color': PHASE_COLORS[art.phase] || '#6b7280' } as React.CSSProperties}>
      <div className="summary-card__header">
        <span>{TYPE_ICONS[art.type] || '📊'}</span>
        <span>{art.title}</span>
        <span className="summary-card__phase" style={{ background: PHASE_COLORS[art.phase] || '#6b7280' }}>
          {art.phase}
        </span>
      </div>
      {art.contentText ? (
        <div className="artifact-markdown summary-card__body">
          <ReactMarkdown>{art.contentText.length > 400 ? art.contentText.slice(0, 400) + '...' : art.contentText}</ReactMarkdown>
        </div>
      ) : art.contentJson ? (
        <pre className="artifact-json summary-card__body" style={{ maxHeight: '160px' }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(art.contentJson, null, 2)) }}
        />
      ) : (
        <p className="artifact-empty">No content.</p>
      )}
    </div>
  );
}

// ── Visual Hero Section ─────────────────────────────────────────────────────
 
function VisualHero({ art }: { art: Artifact }) {
  // wireframe_spec, ux_spec or ux-agent phase -> dùng PenpotPreview
  if (art.type === 'wireframe_spec' || art.type === 'ux_spec' || art.phase === 'ux-agent') {
    // Parse screens từ contentText/contentJson nếu có
    const screens = art.contentJson && Array.isArray((art.contentJson as { screens?: unknown[] }).screens)
      ? ((art.contentJson as { screens: Array<{ name: string; description: string }> }).screens)
      : undefined;

    return (
      <div className="visual-hero">
        <PenpotPreview
          title={art.title}
          description={art.contentText?.slice(0, 200) || undefined}
          screens={screens}
        />
      </div>
    );
  }

  // user_flow / ux_spec / component_inventory → render content inline, hero style
  return (
    <div className="visual-hero visual-hero--doc">
      <div className="visual-hero__header">
        <span className="visual-hero__icon">{TYPE_ICONS[art.type] || '🎨'}</span>
        <div>
          <div className="visual-hero__title">{art.title}</div>
          <div className="visual-hero__phase" style={{ color: PHASE_COLORS[art.phase] || '#6b7280' }}>
            {art.phase}
          </div>
        </div>
      </div>
      {art.contentText ? (
        <div className="artifact-markdown visual-hero__body">
          <ReactMarkdown>{art.contentText}</ReactMarkdown>
        </div>
      ) : art.contentJson ? (
        <pre className="artifact-json" dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(art.contentJson, null, 2)) }} />
      ) : null}
    </div>
  );
}

// ── Edit Mode ───────────────────────────────────────────────────────────────

interface EditPanelProps {
  onCancel: () => void;
  onSave: (content: string) => void;
  initialContent: string;
}

function EditPanel({ onCancel, onSave, initialContent }: EditPanelProps) {
  const [editContent, setEditContent] = useState(initialContent);
  return (
    <div className="flex flex-col h-full gap-2">
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="w-full flex-1 p-4 text-xs font-mono bg-[#050505] border border-outline-variant rounded outline-none focus:border-secondary resize-none"
        style={{ minHeight: '300px', background: '#050505', border: '1px solid #1e293b', borderRadius: '4px', color: '#e3e1e9', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', padding: '1rem' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.5rem', background: '#0d0e13', borderTop: '1px solid #1e293b' }}>
        <button onClick={onCancel} style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 600, color: '#c7c4d7', background: 'transparent', border: '1px solid #1e293b', borderRadius: '4px', cursor: 'pointer' }}>
          Hủy
        </button>
        <button
          onClick={() => onSave(editContent)}
          style={{ padding: '0.35rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: '#6366f1', border: 'none', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 0 10px rgba(99,102,241,0.25)' }}
        >
          Lưu & Approve Gate
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ArtifactViewer({ artifacts, selected, onSelect }: Props) {
  const { updateArtifactContent } = useSdlcStore();
  const [filter, setFilter] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'smart' | 'raw'>('smart');

  const phases = ['all', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'];
  const filtered = filter === 'all' ? artifacts : artifacts.filter((a) => a.phase === filter);

  // ── Priority sort: visual → summary → document ──
  const sortedArtifacts = [...filtered].sort((a, b) => {
    const order: Record<ArtifactCategory, number> = { visual: 0, summary: 1, document: 2 };
    return order[getCategory(a)] - order[getCategory(b)];
  });

  const visuals   = sortedArtifacts.filter((a) => getCategory(a) === 'visual');
  const summaries = sortedArtifacts.filter((a) => getCategory(a) === 'summary');
  const documents = sortedArtifacts.filter((a) => getCategory(a) === 'document');

  const handleSave = (art: Artifact, content: string) => {
    if (art.contentJson) {
      try {
        const parsed = JSON.parse(content);
        updateArtifactContent(art.id, undefined, parsed);
      } catch {
        updateArtifactContent(art.id, content);
      }
    } else {
      updateArtifactContent(art.id, content);
    }
    setIsEditing(false);
  };

  return (
    <div className="artifact-viewer">
      {/* ── Left: Artifact List ── */}
      <div className="artifact-list">
        <div className="artifact-filter">
          {phases.map((p) => (
            <button
              key={p}
              className={`artifact-filter-btn ${filter === p ? 'active' : ''}`}
              onClick={() => setFilter(p)}
            >
              {p === 'all' ? 'All' : p.replace('-agent', '').toUpperCase()}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="artifact-empty-state">No artifacts yet. Run an agent to generate output.</div>
        )}

        {/* Visual artifacts first in list */}
        {visuals.length > 0 && (
          <div className="artifact-list-group">
            <div className="artifact-list-group-label">🎨 Visual</div>
            {visuals.map((art) => (
              <ArtifactListItem key={art.id} art={art} selected={selected} onSelect={onSelect} />
            ))}
          </div>
        )}
        {summaries.length > 0 && (
          <div className="artifact-list-group">
            <div className="artifact-list-group-label">📊 Reports</div>
            {summaries.map((art) => (
              <ArtifactListItem key={art.id} art={art} selected={selected} onSelect={onSelect} />
            ))}
          </div>
        )}
        {documents.length > 0 && (
          <div className="artifact-list-group">
            <div className="artifact-list-group-label">📄 Documents</div>
            {documents.map((art) => (
              <ArtifactListItem key={art.id} art={art} selected={selected} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Content Pane ── */}
      <div className="artifact-content">
        {selected ? (
          <>
            {/* Header */}
            <div className="artifact-content__header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                  {TYPE_ICONS[selected.type]} {selected.title}
                </h3>
                <span
                  className="artifact-content__phase"
                  style={{ background: PHASE_COLORS[selected.phase] || '#6b7280' }}
                >
                  {selected.phase}
                </span>
                <span className={`artifact-category-badge artifact-category-badge--${getCategory(selected)}`}>
                  {getCategory(selected) === 'visual' ? '🎨 Visual' : getCategory(selected) === 'summary' ? '📊 Report' : '📄 Document'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* View mode toggle */}
                {!isEditing && (
                  <div className="artifact-view-toggle">
                    <button
                      className={`artifact-view-btn ${viewMode === 'smart' ? 'active' : ''}`}
                      onClick={() => setViewMode('smart')}
                      title="Smart view"
                    >
                      Smart
                    </button>
                    <button
                      className={`artifact-view-btn ${viewMode === 'raw' ? 'active' : ''}`}
                      onClick={() => setViewMode('raw')}
                      title="Raw text view"
                    >
                      Raw
                    </button>
                  </div>
                )}
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="artifact-edit-btn"
                  >
                    <span style={{ fontSize: '13px' }}>✏️</span>
                    Edit / Groom
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="artifact-content__body">
              {isEditing ? (
                <EditPanel
                  initialContent={selected.contentText || (selected.contentJson ? JSON.stringify(selected.contentJson, null, 2) : '')}
                  onCancel={() => setIsEditing(false)}
                  onSave={(content) => handleSave(selected, content)}
                />
              ) : viewMode === 'raw' ? (
                // Raw mode — always show plaintext
                selected.contentText ? (
                  <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', color: '#e3e1e9', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {selected.contentText}
                  </pre>
                ) : selected.contentJson ? (
                  <pre
                    className="artifact-json"
                    dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(selected.contentJson, null, 2)) }}
                  />
                ) : (
                  <p className="artifact-empty">No content.</p>
                )
              ) : (
                // Smart mode — prioritised display
                <SmartContentView art={selected} />
              )}
            </div>
          </>
        ) : (
          /* No selection — show full list in smart order */
          <ArtifactSmartList visuals={visuals} summaries={summaries} documents={documents} />
        )}
      </div>
    </div>
  );
}

// ── List Item ────────────────────────────────────────────────────────────────

function ArtifactListItem({ art, selected, onSelect }: { art: Artifact; selected: Artifact | null; onSelect: (a: Artifact | null) => void }) {
  const category = getCategory(art);
  return (
    <button
      className={`artifact-item ${selected?.id === art.id ? 'artifact-item--selected' : ''}`}
      onClick={() => onSelect(art)}
      style={{ '--phase-color': PHASE_COLORS[art.phase] || '#6b7280' } as React.CSSProperties}
    >
      <span className="artifact-item__icon">{TYPE_ICONS[art.type] || '📄'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="artifact-item__title">{art.title}</div>
        <div className="artifact-item__meta">{art.phase} · {art.type}</div>
      </div>
      {category === 'visual' && <span style={{ fontSize: '0.6rem', color: '#8b5cf6', flexShrink: 0 }}>🎨</span>}
    </button>
  );
}

// ── Smart Content View (single selected artifact) ────────────────────────────

function SmartContentView({ art }: { art: Artifact }) {
  const category = getCategory(art);
  if (category === 'visual') return <VisualHero art={art} />;
  if (category === 'summary') return <SummaryCard art={art} />;
  // Document — render via accordion (already expanded since it's selected)
  return (
    <div className="artifact-markdown">
      {art.contentText ? (
        <ReactMarkdown>{art.contentText}</ReactMarkdown>
      ) : art.contentJson ? (
        <pre className="artifact-json"
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(art.contentJson, null, 2)) }}
        />
      ) : (
        <p className="artifact-empty">No content.</p>
      )}
    </div>
  );
}

// ── Smart List (when nothing selected — overview mode) ────────────────────────

function ArtifactSmartList({ visuals, summaries, documents }: {
  visuals: Artifact[];
  summaries: Artifact[];
  documents: Artifact[];
}) {
  if (visuals.length === 0 && summaries.length === 0 && documents.length === 0) {
    return (
      <div className="artifact-content__placeholder">
        <div className="artifact-placeholder-icon">📄</div>
        <p>Select an artifact to view its content</p>
      </div>
    );
  }

  return (
    <div className="artifact-smart-list">
      {/* Visual artifacts — hero display */}
      {visuals.length > 0 && (
        <section className="artifact-section">
          <div className="artifact-section-heading">
            <span>🎨</span> Design & Wireframes
          </div>
          <div className="artifact-visual-grid">
            {visuals.map((art) => (
              <VisualHero key={art.id} art={art} />
            ))}
          </div>
        </section>
      )}

      {/* Summary cards — compact grid */}
      {summaries.length > 0 && (
        <section className="artifact-section">
          <div className="artifact-section-heading">
            <span>📊</span> Reports & Metrics
          </div>
          <div className="artifact-summary-grid">
            {summaries.map((art) => (
              <SummaryCard key={art.id} art={art} />
            ))}
          </div>
        </section>
      )}

      {/* Document accordions — collapsed by default */}
      {documents.length > 0 && (
        <section className="artifact-section">
          <div className="artifact-section-heading">
            <span>📄</span> Documents
            <span className="artifact-section-hint">Click to expand</span>
          </div>
          <div className="artifact-accordion-list">
            {documents.map((art) => (
              <DocumentAccordion key={art.id} art={art} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
