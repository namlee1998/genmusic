import React from 'react';
import { Bot, CheckCircle2, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';

export default function EmptyProjectState() {
  const setCreateProjectDialogOpen = useAppStore((s) => s.setCreateProjectDialogOpen);

  return (
    <div className="sdlc-empty-state">
      <motion.div 
        className="sdlc-empty-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="sdlc-empty-icon-wrap">
          <Bot size={48} className="sdlc-empty-icon" />
        </div>
        <h2>Welcome to Autonomous Factory</h2>
        <p>
          Bắt đầu với một project, sau đó mô tả feature cần xây dựng. Hệ thống sẽ
          dẫn bạn qua từng AI agent và các bước duyệt kết quả.
        </p>
        <div className="mt-5 grid gap-2 text-left">
          {[
            '1. Tạo project đầu tiên',
            '2. Chọn New Feature Request và mô tả yêu cầu',
            '3. Chạy PO Agent từ thẻ backlog',
            '4. Duyệt kết quả để mở khóa agent tiếp theo',
          ].map((step) => (
            <div key={step} className="flex items-center gap-2 text-sm text-on-surface-variant">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{step}</span>
            </div>
          ))}
        </div>
        <button 
          className="sdlc-empty-hint mt-5 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          onClick={() => setCreateProjectDialogOpen(true)}
        >
          <PlusCircle size={16} /> <span>Tạo project đầu tiên</span>
        </button>
      </motion.div>
    </div>
  );
}
