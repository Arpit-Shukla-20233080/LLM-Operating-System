import { useRef, useCallback } from 'react';
import { useWindowStore, type WindowState } from '../stores/windowStore';

interface WindowProps {
  win: WindowState;
}

export default function Window({ win }: WindowProps) {
  const { close, focus, minimize, toggleMaximize, move, resize } = useWindowStore();

  // ── Drag state ──────────────────────────────────────────────
  const dragStart = useRef<{ mx: number; my: number; wx: number; wy: number } | null>(null);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (win.maximized) return;
      if ((e.target as HTMLElement).closest('.win-btn')) return; // ignore button clicks
      e.currentTarget.setPointerCapture(e.pointerId);
      focus(win.id);
      dragStart.current = { mx: e.clientX, my: e.clientY, wx: win.x, wy: win.y };
    },
    [win, focus],
  );

  const onTitlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const newX = Math.max(0, dragStart.current.wx + dx);
      const newY = Math.max(0, dragStart.current.wy + dy);
      move(win.id, newX, newY);
    },
    [win.id, move],
  );

  const onTitlePointerUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  // ── Resize state ─────────────────────────────────────────────
  const resizeStart = useRef<{
    mx: number; my: number; ww: number; wh: number;
  } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (win.maximized) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      focus(win.id);
      resizeStart.current = { mx: e.clientX, my: e.clientY, ww: win.width, wh: win.height };
    },
    [win, focus],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeStart.current) return;
      const dx = e.clientX - resizeStart.current.mx;
      const dy = e.clientY - resizeStart.current.my;
      resize(win.id, resizeStart.current.ww + dx, resizeStart.current.wh + dy);
    },
    [win.id, resize],
  );

  const onResizePointerUp = useCallback(() => {
    resizeStart.current = null;
  }, []);

  if (win.minimized) return null;

  const style: React.CSSProperties = win.maximized
    ? {
      left: 0, top: 0,
      width: '100vw',
      height: `calc(100vh - var(--os-taskbar-h))`,
      zIndex: win.zIndex,
      borderRadius: 0,
    }
    : {
      left: win.x,
      top: win.y,
      width: win.width,
      height: win.height,
      zIndex: win.zIndex,
    };

  return (
    <div
      className="window"
      style={style}
      onPointerDown={() => focus(win.id)}
    >
      {/* ── Titlebar ─────────────────────────────────────────── */}
      <div
        className="win-titlebar"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <span className="win-title">{win.title}</span>
        <div className="win-controls">
          <button
            className="win-btn win-btn--min"
            onClick={(e) => { e.stopPropagation(); minimize(win.id); }}
            title="Minimize"
          >
            <span>─</span>
          </button>
          <button
            className="win-btn win-btn--max"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
            title={win.maximized ? 'Restore' : 'Maximize'}
          >
            <span>{win.maximized ? '❐' : '□'}</span>
          </button>
          <button
            className="win-btn win-btn--close"
            onClick={(e) => { e.stopPropagation(); close(win.id); }}
            title="Close"
          >
            <span>✕</span>
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="win-content">
        <WindowContent win={win} />
      </div>

      {/* ── Resize handle ────────────────────────────────────── */}
      {!win.maximized && (
        <div
          className="win-resize-handle"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      )}
    </div>
  );
}

// ── Lazy content router ───────────────────────────────────────
import { lazy, Suspense } from 'react';

const Terminal = lazy(() => import('./apps/Terminal'));
const Settings = lazy(() => import('./apps/Settings'));
const FileViewer = lazy(() => import('./apps/FileViewer'));

function WindowContent({ win }: { win: WindowState }) {
  const props = win.props;

  const fallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--os-text-dim)', fontFamily: 'var(--os-font-mono)', fontSize: '0.8rem' }}>
      loading…
    </div>
  );

  return (
    <Suspense fallback={fallback}>
      {win.component === 'Terminal' && <Terminal {...props} />}
      {win.component === 'Settings' && <Settings {...props} />}
      {win.component === 'FileViewer' && <FileViewer path={props.path as string} />}
    </Suspense>
  );
}
