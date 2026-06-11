import './sdlc.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, History, RefreshCw, Workflow } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import ArtifactViewer from './components/ArtifactViewer';
import EmptyProjectState from './components/EmptyProjectState';
import DeliveryErrorBanner from './components/DeliveryErrorBanner';

export default function OutputsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentProjectId } = useAppStore();
  const {
    projectId, artifacts, selectedArtifact, error,
    setProjectId, setArtifacts, selectArtifact, setError,
  } = useSdlcStore();
  const [loading, setLoading] = useState(false);
  const selectedArtifactIdRef = useRef<string | null>(selectedArtifact?.id || null);
  const loadedContextRef = useRef<string | null>(null);
  const taskId = searchParams.get('task');

  useEffect(() => {
    selectedArtifactIdRef.current = selectedArtifact?.id || null;
  }, [selectedArtifact?.id]);

  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId, projectId, setProjectId]);

  const refreshOutputs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await sdlcApi.getProjectArtifacts(projectId);
      setArtifacts(result.artifacts);
      const requestedSelection = taskId
        ? result.artifacts.find((artifact: { taskId?: string }) => artifact.taskId === taskId)
        : null;
      const retainedSelection = result.artifacts.find(
        (artifact: { id: string }) => artifact.id === selectedArtifactIdRef.current,
      );
      const contextKey = `${projectId}:${taskId || ''}`;
      const nextSelection = loadedContextRef.current === contextKey
        ? retainedSelection || requestedSelection
        : requestedSelection || retainedSelection;
      selectArtifact(nextSelection || result.artifacts[0] || null);
      loadedContextRef.current = contextKey;
    } catch (requestError) {
      setError(sdlcApi.parseApiError(requestError, 'Could not load worker outputs.'));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectArtifact, setArtifacts, setError, taskId]);

  useEffect(() => {
    void Promise.resolve().then(refreshOutputs);
  }, [refreshOutputs]);

  const handoffCount = useMemo(
    () => artifacts.filter((artifact) => artifact.type === 'a2a_handoff').length,
    [artifacts],
  );

  if (!projectId) return <EmptyProjectState />;

  return (
    <main className="sdlc-dashboard">
      <header className="delivery-header">
        <div>
          <p className="delivery-header__eyebrow"><Workflow size={14} /> AIDLC delivery workspace</p>
          <h1>Worker Outputs</h1>
          <p>Full project history is preserved. Open each A2A handoff to compare the approved contract between workers.</p>
        </div>
        <div className="delivery-subnav">
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc')}>
            <ArrowLeft size={15} /> Build
          </button>
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc/audit')}>
            <History size={15} /> Audit
          </button>
          <button className="delivery-subnav__btn is-active">
            <FileText size={15} /> Outputs
          </button>
          <button className="delivery-header__cta" onClick={() => void refreshOutputs()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="delivery-history-note">
        <strong>{artifacts.length}</strong> artifacts retained across workers
        <span>{handoffCount} approved A2A handoff{handoffCount === 1 ? '' : 's'}</span>
      </div>

      <section className="delivery-output delivery-output--fullpage">
        <div className="delivery-output__body">
          <ArtifactViewer artifacts={artifacts} selected={selectedArtifact} onSelect={selectArtifact} />
        </div>
      </section>
    </main>
  );
}
