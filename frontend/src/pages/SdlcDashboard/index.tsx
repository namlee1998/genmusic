import './sdlc.css';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Workflow } from 'lucide-react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useSearchParams } from 'react-router-dom';
import RepoInput from './components/RepoInput';
import PipelineStepper from './components/PipelineStepper';
import GatePanel from './components/GatePanel';
import AuditLog from './components/AuditLog';
import FinalApproval from './components/FinalApproval';
import DetailModal from './components/DetailModal';

export default function SdlcDashboard() {
  const {
    status,
    error,
    pollStatus,
    workflowId
  } = useSdlcStore();

  const [activeDetailType, setActiveDetailType] = useState<'prd' | 'ux_spec' | 'code_diff' | 'qa_report' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightGate = searchParams.get('highlightGate');

  // Poll status occasionally as a robust fallback to SSE
  useEffect(() => {
    if (workflowId && status !== 'idle' && status !== 'failed') {
      void pollStatus();
      const interval = window.setInterval(() => {
        void pollStatus();
      }, 5000);
      return () => window.clearInterval(interval);
    }
  }, [workflowId, status, pollStatus]);

  // Scroll to targeted gate and trigger highlight effect
  useEffect(() => {
    if (!highlightGate) return;
    const timer = setTimeout(() => {
      // Find element by gate id attribute
      const el = document.querySelector(`[data-gate-id="${highlightGate}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('hitl-highlight-pulse');
        setTimeout(() => {
          el.classList.remove('hitl-highlight-pulse');
        }, 3000);
      }
      
      // Clean up search parameter after highlighting
      searchParams.delete('highlightGate');
      setSearchParams(searchParams, { replace: true });
    }, 800);
    return () => clearTimeout(timer);
  }, [highlightGate, searchParams, setSearchParams]);

  return (
    <main className="sdlc-dashboard" style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
      <header className="delivery-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="delivery-header__eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Workflow size={14} className="text-indigo-400" /> 
            <span>AIFA Autonomy Panel</span>
          </p>
          <h1>SDLC Control Center</h1>
          <p style={{ margin: '4px 0 0 0', color: '#908fa0', fontSize: '13px' }}>
            Risk-based pipeline control with autonomous developer agents and automated human gates.
          </p>
        </div>
      </header>

      {error && (
        <div className="delivery-error" style={{ 
          margin: '0 18px 16px', 
          padding: '12px 16px', 
          background: 'rgba(239, 68, 68, 0.08)', 
          border: '1px solid rgba(239, 68, 68, 0.25)', 
          borderRadius: '8px', 
          color: '#fca5a5', 
          fontSize: '13px' 
        }}>
          {error}
        </div>
      )}

      <div className="sdlc-dashboard__content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <RepoInput />
        <PipelineStepper />
        <GatePanel />
        <FinalApproval />
        <AuditLog />
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
