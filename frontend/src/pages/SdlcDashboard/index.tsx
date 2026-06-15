import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import { useSearchParams } from 'react-router-dom';
import AgentTaskBoard from './components/AgentTaskBoard';
import GatePanel from './components/GatePanel';
import AuditLog from './components/AuditLog';
import FinalApproval from './components/FinalApproval';
import DetailModal from './components/DetailModal';
import EmptyProjectState from './components/EmptyProjectState';
import FeatureRequestChatbox from './components/FeatureRequestChatbox';
import BottleneckAlert from './components/BottleneckAlert';
import PipelineStepper from './components/PipelineStepper';

export default function SdlcDashboard() {
  const {
    status,
    error,
    pollStatus,
    workflowId,
    cleanupConnections
  } = useSdlcStore();

  const currentProjectId = useAppStore((s) => s.currentProjectId);

  const [activeDetailType, setActiveDetailType] = useState<'prd' | 'ux_spec' | 'code_diff' | 'qa_report' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightGate = searchParams.get('highlightGate');
  const focusRequest = searchParams.get('focusRequest') === 'true';

  // Ensure polling and SSE are cleaned up when the dashboard unmounts
  useEffect(() => {
    return () => cleanupConnections();
  }, [cleanupConnections]);

  // Initial poll to ensure state is fresh on mount
  useEffect(() => {
    if (workflowId && status !== 'idle' && status !== 'failed') {
      void pollStatus();
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
        el.classList.add('animate-hitl-highlight');
        setTimeout(() => {
          el.classList.remove('animate-hitl-highlight');
        }, 3000);
      }
      
      // Clean up search parameter after highlighting
      searchParams.delete('highlightGate');
      setSearchParams(searchParams, { replace: true });
    }, 800);
    return () => clearTimeout(timer);
  }, [highlightGate, searchParams, setSearchParams]);

  if (!currentProjectId) {
    return (
      <main 
        className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" 
        style={{ 
          maxWidth: '100%', 
          padding: '24px 32px',
          backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
        }}
      >
        <EmptyProjectState />
      </main>
    );
  }

  const showChatbox = focusRequest;

  return (
    <main 
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" 
      style={{ 
        maxWidth: '100%', 
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >

      {error && (
        <div className="mx-[18px] mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-300 text-[13px]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {showChatbox && <FeatureRequestChatbox />}
        <BottleneckAlert />
        <PipelineStepper />
        <AgentTaskBoard setActiveDetailType={setActiveDetailType} />
        <GatePanel />
        <FinalApproval />
        <AuditLog />
      </div>

      <AnimatePresence>
        {activeDetailType && (
          <motion.div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-[#121318] border border-[#1e293b] rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}>
              <DetailModal artifactType={activeDetailType} onClose={() => setActiveDetailType(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

