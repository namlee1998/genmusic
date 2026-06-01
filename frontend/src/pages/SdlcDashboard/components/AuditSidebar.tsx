import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import AuditTimeline from './AuditTimeline';

export const AuditSidebar: React.FC = () => {
  const { isAuditSidebarOpen, setAuditSidebarOpen, auditEvents } = useSdlcStore();

  return (
    <AnimatePresence>
      {isAuditSidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={() => setAuditSidebarOpen(false)}
            className="fixed inset-0 bg-black z-40"
          />

          {/* Sidebar Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-[460px] max-w-[90vw] bg-[#0c0d12] border-l border-outline-variant/30 shadow-2xl z-50 flex flex-col p-6 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">history</span>
                <h2 className="text-base font-bold text-on-surface">Lịch sử Duyệt (Audit Trail)</h2>
              </div>
              <button
                onClick={() => setAuditSidebarOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Timeline container */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AuditTimeline events={auditEvents} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
