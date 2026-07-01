import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { Play, Sparkles, Loader2 } from 'lucide-react';

export default function FeatureRequestChatbox({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const projects = useAppStore((s) => s.projects) || [];
  const currentProject = projects.find((p) => p && p.project_id === currentProjectId);

  const startPipeline = useWorkflowStore((s) => s.startPipeline);
  const isLoading = useWorkflowStore((s) => s.isLoading);

  const [requestText, setRequestText] = useState('');
  const [techStack, setTechStack] = useState('Auto');

  const handleCancel = () => {
    searchParams.delete('focusRequest');
    setSearchParams(searchParams, { replace: true });
    onClose?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestText.trim()) return;

    // Get the repository path silently from local storage (established when importing project)
    const repoUrl = currentProjectId ? (localStorage.getItem(`repoUrl_${currentProjectId}`) || '') : '';

    // Start pipeline (creates a new session)
    const finalRequest = techStack === 'Auto' ? requestText.trim() : `[Tech Stack: ${techStack}] ${requestText.trim()}`;
    await startPipeline(currentProjectId || '', repoUrl, finalRequest);

    // Clear input and close modal
    setRequestText('');
    searchParams.delete('focusRequest');
    setSearchParams(searchParams, { replace: true });

    // Optional: Show toast notification "New session started"
    // (assuming there's a toast system available)
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center px-4">
      <div
        className="w-full max-w-lg rounded-xl bg-[#0d0e13] border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col gap-4 p-6"
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="text-indigo-400" size={18} />
            <h3 className="text-sm font-bold text-white m-0">
              {t('chatbox.title', 'Request a New Feature')} for {currentProject?.name || 'Project'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors text-xs font-semibold px-2 py-1 rounded border border-white/5 hover:bg-white/5 cursor-pointer"
          >
            {t('chatbox.cancel', 'Cancel')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Feature Request Input */}
          <div className="flex flex-col gap-1.5">
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder={t('chatbox.textareaPlaceholder', "Describe the feature you want AIFA to build (e.g., 'Add a sign-up form with password validation')...")}
              rows={5}
              className="w-full bg-slate-950/60 border border-white/10 rounded-md px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/60 placeholder:text-slate-500 transition-colors resize-none"
              autoFocus
            />
          </div>

          {/* Tech Stack Selector */}
          <div className="flex flex-col gap-1.5 mt-1 mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ngôn ngữ mục tiêu (Target Tech Stack)</span>
            <div className="flex gap-2 flex-wrap">
              {['Auto', 'Node.js / React', 'Python / FastAPI', 'Go / Gin', 'Java / Spring'].map((stack) => (
                <button
                  key={stack}
                  type="button"
                  onClick={() => setTechStack(stack)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${techStack === stack ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] border border-indigo-400' : 'bg-slate-900 border border-white/10 text-slate-400 hover:bg-slate-800'}`}
                >
                  {stack === 'Auto' ? '✨ ' : stack.includes('React') ? '🟨 ' : stack.includes('Python') ? '🐍 ' : stack.includes('Go') ? '🐹 ' : '☕ '}
                  {stack}
                </button>
              ))}
            </div>
            <span className="text-[9px] text-slate-500 mt-1 italic">
              * Lựa chọn này sẽ được tự động đính kèm vào yêu cầu để ép Agent viết code theo đúng ngôn ngữ.
            </span>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-1 border-t border-white/5">
            <button
              type="submit"
              disabled={isLoading || !requestText.trim() || !currentProjectId}
              className="bg-indigo-600/90 text-white rounded-md px-5 py-2 hover:bg-indigo-600 transition-colors flex items-center justify-center font-bold text-[13px] disabled:opacity-40 disabled:cursor-not-allowed gap-2 shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Launching Agents...</span>
                </>
              ) : !currentProjectId ? (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Select a Project First</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Launch Agent Pipeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
