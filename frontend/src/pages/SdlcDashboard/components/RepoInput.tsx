import React, { useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { GitBranch, Loader2, BarChart2, Terminal } from 'lucide-react';

export default function RepoInput() {
  const { startPipeline, repoInfo, isLoading, error } = useSdlcStore();
  const [url, setUrl] = useState('');
  const [request, setRequest] = useState('add google login');
  const [validationError, setValidationError] = useState('');

  const validateUrl = (value: string) => {
    if (!value) return 'Repository URL is required';
    const regex = /^(https?:\/\/)?(www\.)?(github|gitlab)\.com\/[\w\-]+\/[\w\-\.]+(\.git)?\/?$/i;
    if (!regex.test(value)) {
      return 'Please enter a valid GitHub or GitLab repository URL (e.g., https://github.com/user/repo.git)';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateUrl(url);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError('');
    await startPipeline(url, request);
  };

  return (
    <div className="repo-input-card">
      <div className="repo-input-card__header">
        <GitBranch className="repo-input-card__icon" size={20} />
        <h3>Repository & Feature Integration</h3>
      </div>
      <form onSubmit={handleSubmit} className="repo-input-card__form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: '#908fa0', fontWeight: 600, letterSpacing: '0.05em' }}>🔗 TARGET REPOSITORY URL</label>
            <input
              type="text"
              placeholder="https://github.com/username/repository.git"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (validationError) setValidationError('');
              }}
              disabled={isLoading}
              className={`repo-input-card__input ${validationError ? 'is-invalid' : ''}`}
              style={{ width: '100%' }}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: '#908fa0', fontWeight: 600, letterSpacing: '0.05em' }}>📝 FEATURE SPECIFICATION / REQUEST</label>
            <textarea
              placeholder="Describe the feature request, code changes, or guidelines for the AIFA worker agents (e.g. add google login)..."
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={isLoading}
              className="repo-input-card__textarea"
              rows={3}
            />
            <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
              Describe what feature, API endpoint, or UI change you want the developer agents to implement.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="submit" disabled={isLoading} className="repo-input-card__submit-btn" style={{ gap: '8px' }}>
              {isLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Terminal size={16} />
                  <span>Start AIFA Orchestrator</span>
                </>
              )}
            </button>
          </div>
        </div>
        {(validationError || error) && (
          <p className="repo-input-card__error">{validationError || error}</p>
        )}
      </form>

      {repoInfo && (
        <div className="repo-analysis-panel">
          <div className="repo-analysis-panel__header">
            <BarChart2 size={16} />
            <h4>Target Repository Scan Analysis</h4>
          </div>
          <div className="repo-analysis-panel__metrics">
            <div className="repo-analysis-panel__metric">
              <span className="label">Tech Stack:</span>
              <span className="value">{repoInfo.techStack.join(', ')}</span>
            </div>
            <div className="repo-analysis-panel__metric">
              <span className="label">Total Files:</span>
              <span className="value">{repoInfo.fileCount} files</span>
            </div>
            <div className="repo-analysis-panel__metric">
              <span className="label">Components:</span>
              <span className="value">{repoInfo.components.join(', ')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
