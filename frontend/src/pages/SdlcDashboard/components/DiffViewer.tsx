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
    <div className="bg-[#090a0f] border border-[#1e293b] rounded-lg overflow-hidden mt-2.5 font-mono">
      {fileName && (
        <div className="bg-[#111218] border-b border-[#1e293b] px-3 py-2 flex items-center">
          <span className="text-[11px] font-semibold text-slate-300">{fileName}</span>
        </div>
      )}
      <div className="overflow-x-auto max-h-[400px]">
        <pre className="m-0 py-2">
          <code>
            {lines.map((line, index) => {
              const displayLine = line;
              let rowClass = 'flex text-[12px] leading-normal whitespace-pre border-l-[3px] border-transparent px-2 py-0.5';
              let textClass = 'text-slate-200';

              if (line.startsWith('+') && !line.startsWith('+++')) {
                rowClass += ' bg-emerald-500/8 border-l-emerald-500';
                textClass = 'text-emerald-200';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                rowClass += ' bg-red-500/8 border-l-red-500';
                textClass = 'text-red-300';
              } else if (line.startsWith('@@')) {
                rowClass += ' bg-purple-500/5 border-l-purple-500';
                textClass = 'text-purple-300';
              } else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
                rowClass += ' bg-blue-500/5 font-bold';
                textClass = 'text-blue-300';
              }

              return (
                <div key={index} className={rowClass}>
                  <span className="text-slate-500 w-10 min-w-10 text-right pr-3 select-none text-[11px]">{index + 1}</span>
                  <span className={textClass}>{displayLine}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
