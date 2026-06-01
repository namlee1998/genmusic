import { useState } from 'react';
import type { Artifact } from '@/store/useSdlcStore';
import ReactMarkdown from 'react-markdown';

interface Props {
  artifacts: Artifact[];
  selected: Artifact | null;
  onSelect: (a: Artifact | null) => void;
}

const TYPE_ICONS: Record<string, string> = {
  prd: '📄', user_stories: '📖', acceptance_criteria: '✅', scope: '🎯',
  ux_spec: '🎨', user_flow: '🔀', wireframe_spec: '🖼️', component_inventory: '🧩',
  implementation_plan: '🗺️', mock_code_diff: '💻', changed_files: '📂', risk_assessment: '⚠️',
  test_cases: '🧪', qa_report: '📊', ac_coverage_matrix: '📋',
};

const PHASE_COLORS: Record<string, string> = {
  'po-agent': '#6366f1', 'ux-agent': '#8b5cf6',
  'dev-agent': '#3b82f6', 'qa-agent': '#10b981',
};

export default function ArtifactViewer({ artifacts, selected, onSelect }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  
  const phases = ['all', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'];
  const filtered = filter === 'all' ? artifacts : artifacts.filter((a) => a.phase === filter);

  const syntaxHighlight = (json: string) => {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) cls = 'key';
            else cls = 'string';
        } else if (/true|false/.test(match)) cls = 'boolean';
        else if (/null/.test(match)) cls = 'null';
        const color = cls === 'key' ? '#9cdcfe' : cls === 'string' ? '#ce9178' : cls === 'number' ? '#b5cea8' : '#569cd6';
        return `<span style="color: ${color};">${match}</span>`;
    });
  };

  const renderContent = (art: Artifact) => {
    if (isEditing) {
      return (
        <div className="flex flex-col h-full gap-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 text-xs font-mono bg-[#050505] border border-outline-variant rounded outline-none focus:border-secondary resize-none"
          />
          <div className="flex justify-end gap-2 p-2 bg-[#0d0e13] border-t border-outline-variant">
            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-variant rounded transition-colors">Hủy</button>
            <button onClick={() => {
              // Optimistic save (in real app, call API here)
              if (art.contentText) art.contentText = editContent;
              if (art.contentJson) {
                try { art.contentJson = JSON.parse(editContent); } catch(e) {}
              }
              setIsEditing(false);
            }} className="px-3 py-1.5 text-xs font-semibold text-on-primary bg-primary hover:opacity-90 rounded transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]">Lưu & Approve Gate</button>
          </div>
        </div>
      );
    }
    
    if (art.contentText) {
      return (
        <div className="artifact-markdown">
          <ReactMarkdown>{art.contentText}</ReactMarkdown>
        </div>
      );
    }
    if (art.contentJson) {
      return <pre className="artifact-json" dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(art.contentJson, null, 2)) }} />;
    }
    return <p className="artifact-empty">No content</p>;
  };

  return (
    <div className="artifact-viewer">
      {/* Left: list */}
      <div className="artifact-list">
        <div className="artifact-filter">
          {phases.map((p) => (
            <button key={p} className={`artifact-filter-btn ${filter === p ? 'active' : ''}`}
              onClick={() => setFilter(p)}>
              {p === 'all' ? 'All' : p.replace('-agent', '').toUpperCase()}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="artifact-empty-state">No artifacts yet. Run an agent to generate output.</div>
        )}

        {filtered.map((art) => (
          <button
            key={art.id}
            className={`artifact-item ${selected?.id === art.id ? 'artifact-item--selected' : ''}`}
            onClick={() => onSelect(art)}
            style={{ '--phase-color': PHASE_COLORS[art.phase] || '#6b7280' } as React.CSSProperties}
          >
            <span className="artifact-item__icon">{TYPE_ICONS[art.type] || '📄'}</span>
            <div>
              <div className="artifact-item__title">{art.title}</div>
              <div className="artifact-item__meta">{art.phase} · {art.type}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Right: content */}
      <div className="artifact-content">
        {selected ? (
          <>
            <div className="artifact-content__header flex justify-between items-center pr-4">
              <div className="flex items-center gap-3">
                <h3>{TYPE_ICONS[selected.type]} {selected.title}</h3>
                <span className="artifact-content__phase"
                  style={{ background: PHASE_COLORS[selected.phase] || '#6b7280' }}>
                  {selected.phase}
                </span>
              </div>
              {!isEditing && (
                <button 
                  onClick={() => {
                    setEditContent(selected.contentText || (selected.contentJson ? JSON.stringify(selected.contentJson, null, 2) : ''));
                    setIsEditing(true);
                  }}
                  className="px-3 py-1 rounded text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  Edit / Groom
                </button>
              )}
            </div>
            <div className={`artifact-content__body ${isEditing ? 'p-0 overflow-hidden flex-1 flex flex-col' : ''}`}>
              {renderContent(selected)}
            </div>
          </>
        ) : (
          <div className="artifact-content__placeholder">
            <div className="artifact-placeholder-icon">📄</div>
            <p>Select an artifact to view its content</p>
          </div>
        )}
      </div>
    </div>
  );
}
