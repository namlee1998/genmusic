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
      } catch (err) {
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
    } catch (err) {
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
    <div className="detail-modal-card">
      <div className="detail-modal-card__header">
        <div className="detail-modal-card__title">
          <FileText size={18} className="text-blue-500" />
          <h3>{getTitle()}</h3>
        </div>
        <div className="detail-modal-card__actions">
          <button
            onClick={handleCopy}
            className="btn-icon"
            title="Copy to clipboard"
            disabled={loading}
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Clipboard size={16} />}
          </button>
          <button onClick={onClose} className="btn-icon" title="Close">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="detail-modal-card__body">
        {loading ? (
          <div className="detail-modal-card__loading">
            <Loader2 className="animate-spin text-blue-500" size={32} />
            <p>Loading artifact content...</p>
          </div>
        ) : artifactType === 'code_diff' ? (
          <pre className="detail-modal-code-diff">
            <code>{content}</code>
          </pre>
        ) : (
          <div className="detail-modal-markdown artifact-markdown">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
