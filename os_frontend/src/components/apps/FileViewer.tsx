import { useEffect, useState, useCallback } from 'react';
import { useWindowStore } from '../../stores/windowStore';

interface FileViewerProps {
  path: string;
  isDirectory?: boolean;
}

interface WorkspaceEntry {
  type: 'file' | 'directory';
  name: string;
  path: string;
  size: number | null;
  modified: string;
  mime: string | null;
  children: number | null;
}

const TEXT_EXTS = new Set([
  '.md', '.txt', '.json', '.py', '.yaml', '.yml',
  '.log', '.sh', '.toml', '.html', '.css', '.ts',
  '.js', '.tsx', '.jsx', '.env', '.cfg', '.ini',
]);

function getExt(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function isTextPath(path: string) {
  return TEXT_EXTS.has(getExt(path.split('/').pop() ?? ''));
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const SYSTEM_DIRS = new Set(['sessions', 'memory', 'cron', 'inbox']);

function entryIcon(entry: WorkspaceEntry) {
  if (entry.type === 'directory') return SYSTEM_DIRS.has(entry.name) ? '🔒' : '📁';
  const icons: Record<string, string> = {
    '.md': '📄', '.txt': '📝', '.json': '⚙️', '.py': '🐍',
    '.html': '🌐', '.log': '📋', '.yaml': '🗂️', '.yml': '🗂️',
    '.sh': '⚡', '.toml': '🔧',
  };
  return icons[getExt(entry.name)] ?? '📄';
}

// ── Very lightweight syntax coloring ─────────────────────────
function SyntaxHighlight({ content, path }: { content: string; path: string }) {
  const ext = getExt(path.split('/').pop() ?? '');

  if (ext === '.json') {
    // Colorize JSON
    const html = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"([^"\\]|\\.)*"(?=\s*:)/g, '<span class="syn-key">$&</span>')
      .replace(/:\s*"([^"\\]|\\.)*"/g, (m) => `: <span class="syn-str">${m.slice(m.indexOf('"'))}</span>`)
      .replace(/:\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g, ': <span class="syn-num">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="syn-kw">$1</span>');
    return <pre className="fileviewer-code" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (ext === '.py') {
    const keywords = ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif',
      'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'in', 'not',
      'and', 'or', 'is', 'True', 'False', 'None', 'async', 'await', 'pass', 'raise'];
    let html = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Strings
    html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')/g,
      '<span class="syn-str">$1</span>');
    // Comments
    html = html.replace(/(#.*)/g, '<span class="syn-comment">$1</span>');
    // Keywords
    const kwRe = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    html = html.replace(kwRe, '<span class="syn-kw">$1</span>');
    return <pre className="fileviewer-code" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // Plain text / markdown / other
  return <pre className="fileviewer-code">{content}</pre>;
}

export default function FileViewer({ path, isDirectory }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [entries, setEntries] = useState<WorkspaceEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(path);
  const open = useWindowStore((s) => s.open);

  const loadPath = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      setContent(null);
      setEntries(null);
      setCurrentPath(p);

      try {
        // First check if it's a directory via metadata
        const metaRes = await fetch(`/workspace/files?path=${encodeURIComponent(p)}`);
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
        const meta = await metaRes.json() as { type: string; entries?: WorkspaceEntry[] };

        if (meta.type === 'directory') {
          setEntries(meta.entries ?? []);
        } else {
          // File — read content
          const readRes = await fetch(`/workspace/files/read?path=${encodeURIComponent(p)}`);
          if (!readRes.ok) throw new Error(`HTTP ${readRes.status}`);
          const text = await readRes.text();
          setContent(text);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isDirectory) {
      // Load as directory listing
      loadPath(path);
    } else if (isTextPath(path)) {
      loadPath(path);
    } else {
      // Try anyway
      loadPath(path);
    }
  }, [path, isDirectory, loadPath]);

  const handleEntryClick = useCallback(
    (entry: WorkspaceEntry) => {
      if (entry.type === 'directory') {
        loadPath(entry.path);
      } else if (isTextPath(entry.path)) {
        open(`file-${entry.path}`, {
          title: entry.name,
          component: 'FileViewer',
          props: { path: entry.path },
        });
      } else {
        window.open(
          `/workspace/files/read?path=${encodeURIComponent(entry.path)}&download=true`,
          '_blank',
        );
      }
    },
    [loadPath, open],
  );

  // Breadcrumb
  const crumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="fileviewer">
      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <div className="fileviewer-breadcrumb">
        <button className="crumb-btn" onClick={() => loadPath('')}>⌂ workspace</button>
        {crumbs.map((crumb, i) => {
          const p = crumbs.slice(0, i + 1).join('/');
          return (
            <span key={p}>
              <span className="crumb-sep">/</span>
              <button className="crumb-btn" onClick={() => loadPath(p)}>{crumb}</button>
            </span>
          );
        })}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="fileviewer-body">
        {loading && (
          <div className="fileviewer-loading">
            <span className="spin">◈</span> Loading…
          </div>
        )}

        {error && <div className="fileviewer-error">❌ {error}</div>}

        {/* Directory listing */}
        {entries && !loading && (
          <div className="fileviewer-dir">
            {entries.length === 0 && (
              <div className="fileviewer-empty">Empty directory</div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.path}
                className={`dir-entry dir-entry--${entry.type}`}
                onDoubleClick={() => handleEntryClick(entry)}
                onClick={() => handleEntryClick(entry)}
                title={entry.path}
              >
                <span className="dir-icon">{entryIcon(entry)}</span>
                <span className="dir-name">{entry.name}</span>
                <span className="dir-meta">
                  {entry.type === 'directory'
                    ? `${entry.children ?? 0} items`
                    : formatSize(entry.size)}
                </span>
                <span className="dir-modified">
                  {entry.modified ? new Date(entry.modified).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* File content */}
        {content != null && !loading && (
          <SyntaxHighlight content={content} path={currentPath} />
        )}
      </div>
    </div>
  );
}
