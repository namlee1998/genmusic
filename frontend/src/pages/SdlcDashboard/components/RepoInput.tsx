import React, { useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { GitBranch, Loader2, BarChart2 } from 'lucide-react';

export default function RepoInput() {
  const { submitRepo, repoInfo, isLoading, error } = useSdlcStore();
  const [url, setUrl] = useState('');
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
    await submitRepo(url);
  };

  return (
    <div className="repo-input-card">
      <div className="repo-input-card__header">
        <GitBranch className="repo-input-card__icon" size={20} />
        <h3>Repository Integration</h3>
      </div>
      <form onSubmit={handleSubmit} className="repo-input-card__form">
        <div className="repo-input-card__field">
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
          />
          <button type="submit" disabled={isLoading} className="repo-input-card__submit-btn">
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              'Analyze'
            )}
          </button>
        </div>
        {(validationError || error) && (
          <p className="repo-input-card__error">{validationError || error}</p>
        )}
      </form>

      {repoInfo && (
        <div className="repo-analysis-panel">
          <div className="repo-analysis-panel__header">
            <BarChart2 size={16} />
            <h4>Repository Analysis Results</h4>
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
