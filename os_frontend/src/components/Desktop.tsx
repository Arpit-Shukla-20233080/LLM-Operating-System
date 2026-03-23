import { useEffect, useState, useCallback, useRef } from 'react';
import { useWindowStore } from '../stores/windowStore';

interface WorkspaceEntry {
  type: 'file' | 'directory';
  name: string; path: string; size: number | null;
  modified: string; mime: string | null; children: number | null;
}

const SYSTEM_DIRS = new Set(['sessions', 'memory', 'cron', 'inbox']);

function getExt(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}
function isTextFile(entry: WorkspaceEntry) {
  return new Set(['.md', '.txt', '.json', '.py', '.yaml', '.yml', '.log', '.sh', '.toml', '.html']).has(getExt(entry.name));
}

// Use real emoji - write as unicode escape to avoid encoding issues
const FILE_EMOJI: Record<string, string> = {
  directory: '\uD83D\uDCC1',
  system: '\uD83D\uDD12',
  '.md': '\uD83D\uDCC4',
  '.txt': '\uD83D\uDCDD',
  '.json': '\u2699\uFE0F',
  '.py': '\uD83D\uDC0D',
  '.html': '\uD83C\uDF10',
  '.log': '\uD83D\uDCCB',
  '.yaml': '\uD83D\uDDC2\uFE0F',
  '.yml': '\uD83D\uDDC2\uFE0F',
  '.sh': '\u26A1',
  '.toml': '\uD83D\uDD27',
  '.txt2': '\uD83D\uDCDD',
};
function getEmoji(entry: WorkspaceEntry) {
  if (entry.type === 'directory') return SYSTEM_DIRS.has(entry.name) ? FILE_EMOJI.system : FILE_EMOJI.directory;
  return FILE_EMOJI[getExt(entry.name)] ?? '\uD83D\uDCC4';
}

export default function Desktop() {
  const [files, setFiles] = useState<WorkspaceEntry[]>([]);
  const [showApps, setShowApps] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const open = useWindowStore(s => s.open);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch('/workspace/files')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { entries: WorkspaceEntry[] }) => setFiles(d.entries ?? []))
      .catch(() => setLoadErr(true));
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!showApps) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setShowApps(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 120);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [showApps]);

  const handleEntry = useCallback((entry: WorkspaceEntry) => {
    setShowApps(false);
    if (entry.type === 'directory') {
      open('explorer-' + entry.path, {
        title: entry.name, component: 'FileViewer',
        props: { path: entry.path, isDirectory: true }, width: 560, height: 440,
      });
    } else if (isTextFile(entry)) {
      open('file-' + entry.path, {
        title: entry.name, component: 'FileViewer',
        props: { path: entry.path }, width: 680, height: 520,
      });
    } else {
      window.open('/workspace/files/read?path=' + encodeURIComponent(entry.path) + '&download=true', '_blank');
    }
  }, [open]);

  return (
    <div className="hero-container">
      <div className="hero-bg" />

      {/* Top label */}
      <div className="hero-label">llm os</div>

      {/* Center */}
      <div className="hero-center">
        <h1 className="hero-title">Welcome</h1>
        <p className="hero-sub">to your new workspace</p>
        <button
          ref={btnRef}
          className="hero-btn"
          onClick={() => setShowApps(s => !s)}
        >
          {showApps ? 'Close' : 'workspace'}
        </button>
      </div>

      {/* Apps + Files panel */}
      {showApps && (
        <div className="apps-panel" ref={panelRef}>
          <div className="apps-panel-header">
            <span className="apps-panel-title">Apps &amp; Files</span>
            <button className="apps-panel-close" onClick={() => setShowApps(false)}>✕</button>
          </div>
          <div className="apps-grid">
            {/* Static app launchers */}
            <AppIcon emoji="⚡" label="Terminal"
              onClick={() => { open('terminal-main', { title: 'Terminal', component: 'Terminal' }); setShowApps(false); }} />
            <AppIcon emoji="⚙️" label="Settings"
              onClick={() => { open('settings-main', { title: 'Settings', component: 'Settings' }); setShowApps(false); }} />

            {/* Workspace files */}
            {files.map(entry => (
              <AppIcon
                key={entry.path}
                emoji={getEmoji(entry)}
                label={entry.name}
                onClick={() => handleEntry(entry)}
              />
            ))}

            {loadErr && (
              <div style={{ gridColumn: '1/-1', padding: '12px', color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' }}>
                Could not load workspace files
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlapping avatar */}
      <div className="hero-avatar-overlap">
        <div className="hero-avatar">&#129302;</div>
      </div>
    </div>
  );
}

function AppIcon({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="app-icon" onClick={onClick}>
      <span className="app-icon-emoji">{emoji}</span>
      <span className="app-icon-label">{label}</span>
    </button>
  );
}