import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export function ImportProjectDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string, url: string, files?: File[], onProgress?: (pct: number) => void) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'browse' | 'manual'>('browse');
  const [value, setValue] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validatePath = (pathStr: string) => {
    if (!pathStr.trim()) return t('layout.projectNameLabel', 'Local folder path is required');
    const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/i.test(pathStr.trim());
    const isUnixAbsolute = pathStr.trim().startsWith('/') || pathStr.trim().startsWith('\\\\');
    if (!isWindowsAbsolute && !isUnixAbsolute) {
      return 'Please enter a valid absolute local directory path (e.g., C:\\Projects\\my-app or /Users/name/my-app)';
    }
    return '';
  };

  const [skippedCount, setSkippedCount] = useState(0);
  const [largeSkippedCount, setLargeSkippedCount] = useState(0);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log('Folder selection triggered. Raw files count:', files ? files.length : 0);
    
    if (!files || files.length === 0) {
      // If length is 0, the user selected an empty folder (or cancelled).
      // We allow this so they can create an empty project.
      setSelectedFiles([]);
      setFolderName('Empty Folder (or Cancelled)');
      return;
    }

    if (files && files.length > 0) {
      setError(null);
      const fileList = Array.from(files);
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB safe limit
      let largeCount = 0;
      let ignoredCount = 0;
      
      const filteredList = fileList.filter(file => {
        const pathStr = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
        const isIgnored = 
          pathStr.includes('/node_modules/') || 
          pathStr.includes('/.git/') || 
          pathStr.includes('/dist/') || 
          pathStr.includes('/build/') || 
          pathStr.includes('/.venv/') || 
          pathStr.includes('/env/');
        
        if (isIgnored) {
          ignoredCount++;
          return false;
        }

        const isTooLarge = file.size > MAX_FILE_SIZE;
        if (isTooLarge) {
          largeCount++;
          return false;
        }
        return true;
      });

      console.log('Filtered files count (excluding node_modules, .git, etc.):', filteredList.length);
      console.log('Skipped large files count:', largeCount);

      setSelectedFiles(filteredList);
      setSkippedCount(ignoredCount);
      setLargeSkippedCount(largeCount);

      // Extract the top-level directory name from webkitRelativePath
      const firstPath = fileList[0].webkitRelativePath || fileList[0].name;
      const cleanPath = firstPath.replace(/\\/g, '/');
      const dirName = cleanPath.split('/')[0] || 'Imported Folder';
      setFolderName(dirName);

      // Auto-populate project name if empty
      if (!projectName) {
        setProjectName(dirName);
      }

      // Reset the input value so selecting the same folder again triggers onChange
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (mode === 'browse') {
      const name = projectName.trim();
      if (!name) {
        setError('Project name is required');
        return;
      }
      setSubmitting(true);
      setError(null);
      setUploadProgress(selectedFiles.length > 0 ? 0 : null);
      try {
        const dummyPath = `C:\\Projects\\${name}`;
        await onSubmit(name, dummyPath, selectedFiles, selectedFiles.length > 0 ? setUploadProgress : undefined);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err as Error)?.message ??
          t('layout.createProjectFailed');
        setError(msg);
      } finally {
        setSubmitting(false);
        setUploadProgress(null);
      }
    } else {
      const pathStr = value.trim();
      const validationError = validatePath(pathStr);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const cleanPath = pathStr.replace(/[\\/]+$/, '');
        const repoName = cleanPath.split(/[\\/]/).pop() || 'Imported Project';
        await onSubmit(repoName, pathStr);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err as Error)?.message ??
          t('layout.createProjectFailed');
        setError(msg);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded border border-outline-variant bg-surface-container-lowest shadow-2xl p-5">
        <h4 className="text-sm font-semibold text-on-surface mb-3">{t('layout.createProjectTitle')}</h4>

        {/* Mode switcher */}
        <div className="flex gap-2 mb-4 p-0.5 bg-surface-container rounded-lg border border-outline-variant/30 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setMode('browse')}
            className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-colors ${
              mode === 'browse'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Select Folder
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-colors ${
              mode === 'manual'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Enter Path
          </button>
        </div>

        {mode === 'browse' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-label-mono uppercase tracking-wider">
                Project Name
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded border border-outline-variant px-3 py-2 text-xs bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary outline-none transition-colors"
                placeholder="Enter project name..."
              />
            </div>
            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-label-mono uppercase tracking-wider">
                Select Local Folder
              </label>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFolderSelect}
                multiple
                {...({
                  webkitdirectory: '',
                  directory: '',
                } as any)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center border-2 border-dashed border-outline-variant hover:border-primary/50 rounded-xl p-6 bg-surface-container hover:bg-surface-variant/30 transition-all group"
              >
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant group-hover:text-primary mb-2 transition-colors">
                  folder_open
                </span>
                <span className="text-xs font-semibold text-on-surface">
                  {folderName ? `Selected: ${folderName}` : 'Browse Local Folder...'}
                </span>
                {selectedFiles.length > 0 && (
                  <span className="text-[10px] text-on-surface-variant/60 mt-1">
                    {selectedFiles.length} files selected
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="text-[9px] text-primary/80 mt-1 text-center px-1">
                    Filtered {skippedCount} files (node_modules, .git, .venv, etc.) to speed up upload
                  </span>
                )}
                {largeSkippedCount > 0 && (
                  <span className="text-[9px] text-warning mt-1 text-center px-1 font-medium">
                    Skipped {largeSkippedCount} file(s) &gt; 15MB (e.g. database, binaries, zip) to prevent upload limit errors
                  </span>
                )}
              </button>
              {folderName && folderName !== 'Empty Folder (or Cancelled)' && selectedFiles.length === 0 && (
                <p className="mt-2 text-[10px] text-error font-medium text-center">
                  ⚠️ No usable files found (or all files were filtered out because they are too large (&gt;15MB) or match ignored folders like node_modules, .git).
                </p>
              )}
              {folderName === 'Empty Folder (or Cancelled)' && (
                <p className="mt-2 text-[10px] text-primary font-medium text-center">
                  ℹ️ Bạn đã chọn một thư mục rỗng. Một dự án trống sẽ được khởi tạo.
                </p>
              )}
              {folderName && !projectName.trim() && (
                <p className="mt-2 text-[10px] text-error font-medium text-center">
                  ⚠️ Vui lòng nhập Tên Dự Án để có thể tiếp tục tạo.
                </p>
              )}
              <p className="text-[9px] text-on-surface-variant/60 mt-1.5 leading-normal text-center">
                Tip: Use <strong>Enter Path</strong> tab for immediate local workspace linking.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] text-on-surface-variant mb-1 font-label-mono uppercase tracking-wider">
              {t('layout.projectNameLabel')}
            </label>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancel();
                if (e.key === 'Enter') void handleSubmit();
              }}
              className="w-full rounded border border-outline-variant px-3 py-2 text-xs bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary outline-none transition-colors"
              placeholder={t('layout.projectNamePlaceholder')}
            />
          </div>
        )}

        {error && (
          <p className="mt-3 rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </p>
        )}

        {submitting && uploadProgress !== null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant mb-1">
              <span>Uploading {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}…</span>
              <span className="font-semibold text-on-surface">{uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
          >
            {t('layout.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (mode === 'browse' ? !projectName.trim() : !value.trim())}
            className="flex-1 rounded bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          >
            {submitting
              ? (uploadProgress !== null ? `Uploading… ${uploadProgress}%` : t('layout.creating'))
              : t('layout.createProjectBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
