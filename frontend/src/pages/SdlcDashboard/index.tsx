import './sdlc.css';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Workflow, History, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from 'react-i18next';
import RepoInput from './components/RepoInput';
import PipelineStepper from './components/PipelineStepper';
import ApprovalQueue from './components/ApprovalQueue';
import QAResultCard from './components/QAResultCard';
import DetailModal from './components/DetailModal';

export default function SdlcDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentProjectId, treeLoaded, fetchTree } = useAppStore();
  const {
    projectId,
    pipelineStatus,
    setProjectId,
    pollStatus,
    error
  } = useSdlcStore();

  const [activeDetailType, setActiveDetailType] = useState<'prd' | 'ux_spec' | 'code_diff' | 'qa_report' | null>(null);

  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) {
      setProjectId(currentProjectId);
    }
  }, [currentProjectId, projectId, setProjectId]);

  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [treeLoaded, fetchTree]);

  // Initial poll on load
  useEffect(() => {
    if (projectId) {
      void pollStatus();
    }
  }, [projectId, pollStatus]);

  // Sequential poll when pipeline is running
  useEffect(() => {
    if (pipelineStatus === 'idle' || pipelineStatus === 'qa_complete' || pipelineStatus === 'failed') return;

    // Poll immediately
    void pollStatus();

    const interval = window.setInterval(() => {
      void pollStatus();
    }, 2000); // 2 seconds

    return () => window.clearInterval(interval);
  }, [pipelineStatus, pollStatus]);

  return (
    <main className="sdlc-dashboard">
      <header className="delivery-header">
        <div>
          <p className="delivery-header__eyebrow"><Workflow size={14} /> {t('dashboard.workspace')}</p>
          <h1>{t('dashboard.title')}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <div className="delivery-subnav">
          <button className="delivery-subnav__btn is-active">
            <Workflow size={15} /> {t('dashboard.build')}
          </button>
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc/audit')}>
            <History size={15} /> {t('dashboard.audit')}
          </button>
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc/outputs')}>
            <FileText size={15} /> {t('dashboard.outputs')}
          </button>
        </div>
      </header>

      {error && <div className="delivery-error">{error}</div>}

      <div className="sdlc-dashboard__content">
        {pipelineStatus === 'idle' ? (
          <RepoInput />
        ) : (
          <div className="pipeline-workspace-grid">
            <div className="pipeline-workspace-main">
              <PipelineStepper />
              <ApprovalQueue onViewDetail={(type) => setActiveDetailType(type)} />
              <QAResultCard onViewDetail={(type) => setActiveDetailType(type)} />

              {pipelineStatus !== 'qa_complete' && pipelineStatus !== 'failed' && pipelineStatus !== 'awaiting_approval' && (
                <div className="pipeline-running-status-card">
                  <div className="pipeline-running-status-spinner">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </div>
                  <p>Agent is executing current pipeline step. Please wait...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeDetailType && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}>
              <DetailModal artifactType={activeDetailType} onClose={() => setActiveDetailType(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

