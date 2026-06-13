import React, { useEffect, useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import ReactMarkdown from 'react-markdown';
import { X, Loader2, FileText, Clipboard, Check } from 'lucide-react';

interface DetailModalProps {
  artifactType: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report';
  onClose: () => void;
}

export default function DetailModal({ artifactType, onClose }: DetailModalProps) {
  const { projectId } = useSdlcStore();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      setLoading(true);
      try {
        const res = await sdlcApi.getArtifactContent(projectId || 'default-project', artifactType);
        if (active) {
          setContent(res.content);
        }
      } catch {
        if (active) {
          setContent('Failed to load artifact content.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void fetchContent();
    return () => {
      active = false;
    };
  }, [projectId, artifactType]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const getTitle = () => {
    switch (artifactType) {
      case 'prd':
        return 'Product Requirements Document (PRD)';
      case 'ux_spec':
        return 'UI/UX Specification';
      case 'code_diff':
        return 'DEV Unified Git Code Diff';
      case 'qa_report':
        return 'QA Audit Report (QA.md)';
      default:
        return 'Artifact Details';
    }
  };

  return (
    <div className="bg-[#121318] border border-[#1e293b] rounded-lg shadow-2xl overflow-hidden flex flex-col h-[80vh] max-h-[700px] w-[min(800px,95vw)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b] bg-[#0d0e13]">
        <div className="flex items-center gap-2.5">
          <FileText size={18} className="text-blue-500" />
          <h3 className="text-[15px] font-bold text-white m-0">{getTitle()}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="bg-transparent border-0 text-[#908fa0] cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-white/5 hover:text-white disabled:opacity-50"
            title="Copy to clipboard"
            disabled={loading}
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Clipboard size={16} />}
          </button>
          <button onClick={onClose} className="bg-transparent border-0 text-[#908fa0] cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-white/5 hover:text-white" title="Close">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#908fa0] text-[13px]">
            <Loader2 className="animate-spin text-blue-500" size={32} />
            <p>Loading artifact content...</p>
          </div>
        ) : artifactType === 'code_diff' ? (
          <pre className="bg-[#050505] border border-[#1e293b] rounded-lg p-4 font-mono text-[12px] leading-normal overflow-x-auto text-[#89ceff] m-0">
            <code>{content}</code>
          </pre>
        ) : (
          <div className="markdown-preview text-[13px] leading-relaxed text-slate-300">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
