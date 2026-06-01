import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ResizablePanelsProps {
  storageKey: string;
  defaultLeftPercent?: number;
  minLeftPx?: number;
  minRightPx?: number;
  className?: string;
  children: [React.ReactNode, React.ReactNode];
}

export function ResizablePanels({
  storageKey,
  defaultLeftPercent = 28,
  minLeftPx = 220,
  minRightPx = 320,
  className = '',
  children,
}: ResizablePanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startPercent = useRef(0);

  const init = () => {
    try {
      const v = localStorage.getItem(`rpanel_${storageKey}`);
      return v ? parseFloat(v) : defaultLeftPercent;
    } catch {
      return defaultLeftPercent;
    }
  };

  const [leftPercent, setLeftPercent] = useState(init);

  const clamp = useCallback(
    (pct: number) => {
      const containerW = containerRef.current?.offsetWidth ?? 800;
      const minLeft = (minLeftPx / containerW) * 100;
      const maxLeft = ((containerW - minRightPx) / containerW) * 100;
      return Math.min(Math.max(pct, minLeft), maxLeft);
    },
    [minLeftPx, minRightPx],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startPercent.current = leftPercent;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [leftPercent],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const dx = e.clientX - startX.current;
        const containerW = containerRef.current.offsetWidth;
        const newPct = clamp(startPercent.current + (dx / containerW) * 100);
        setLeftPercent(newPct);
        try { localStorage.setItem(`rpanel_${storageKey}`, String(newPct)); } catch {
          // Ignore storage errors (e.g. quota exceeded)
        }
      });
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clamp, storageKey]);

  const [leftChild, rightChild] = children;

  return (
    <div ref={containerRef} className={`flex overflow-hidden ${className}`}>
      {/* Left panel */}
      <div
        style={{ width: `${leftPercent}%`, minWidth: minLeftPx }}
        className="flex flex-col overflow-hidden shrink-0"
      >
        {leftChild}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-3 shrink-0 flex items-center justify-center cursor-col-resize select-none group"
      >
        <div className="w-px h-full bg-outline-variant/30 group-hover:bg-primary/50 transition-colors duration-150" />
        <div className="absolute w-4 h-10 rounded-full bg-surface-container border border-outline-variant/40 group-hover:border-primary/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none">
          <span className="material-symbols-outlined text-[12px] text-on-surface-variant group-hover:text-primary">drag_indicator</span>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{ minWidth: minRightPx }}
        className="flex-1 flex flex-col overflow-hidden min-w-0"
      >
        {rightChild}
      </div>
    </div>
  );
}
