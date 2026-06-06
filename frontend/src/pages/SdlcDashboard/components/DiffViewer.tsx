import React from 'react';

interface DiffViewerProps {
  diff: string;
  fileName?: string;
}

export default function DiffViewer({ diff, fileName }: DiffViewerProps) {
  if (!diff) {
    return (
      <div className="diff-viewer__empty">
        No changes detected or no diff available.
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="diff-viewer">
      {fileName && (
        <div className="diff-viewer__file-header">
          <span className="diff-viewer__file-name">{fileName}</span>
        </div>
      )}
      <div className="diff-viewer__content">
        <pre className="diff-viewer__pre">
          <code>
            {lines.map((line, index) => {
              let className = 'diff-line';
              let displayLine = line;
              if (line.startsWith('+') && !line.startsWith('+++')) {
                className += ' diff-line--added';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                className += ' diff-line--removed';
              } else if (line.startsWith('@@')) {
                className += ' diff-line--chunk';
              } else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
                className += ' diff-line--header';
              }

              return (
                <div key={index} className={className}>
                  <span className="diff-line__number">{index + 1}</span>
                  <span className="diff-line__text">{displayLine}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
