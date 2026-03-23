import { useEffect, useState, useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import ChatBar from './ChatBar';

interface HealthStatus { status: 'ok' | 'starting' | 'error'; model: string | null; }

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="ww-clock">
      <span className="ww-clock-time">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="ww-clock-date">
        {days[now.getDay()]} · {months[now.getMonth()]} {now.getDate()}
      </span>
    </div>
  );
}

export default function Taskbar() {
  const { windows, open, restore, minimize, focus } = useWindowStore();
  const [health, setHealth] = useState<HealthStatus>({ status: 'starting', model: null });

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) throw new Error('not ok');
        const data: HealthStatus = await res.json();
        if (mounted) setHealth({ status: data.status === 'ok' ? 'ok' : 'starting', model: data.model });
      } catch { if (mounted) setHealth({ status: 'error', model: null }); }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const handleTask = useCallback((id: string) => {
    const win = windows[id];
    if (!win) return;
    if (win.minimized) { restore(id); return; }
    const maxZ = Math.max(...Object.values(windows).map(w => w.zIndex));
    if (win.zIndex === maxZ) minimize(id); else focus(id);
  }, [windows, restore, minimize, focus]);

  const openWindows = Object.values(windows);

  return (
    <div className="ww-taskbar">
      {/* ── Left: avatars + open window pills ─────────────── */}
      <div className="ww-taskbar-left">
        <div className="ww-avatars">
          <div className="ww-avatar ww-avatar--1">🧑</div>
          <div className="ww-avatar ww-avatar--2">👩</div>
        </div>
        {openWindows.map(win => {
          const maxZ = Math.max(...openWindows.map(w => w.zIndex));
          const active = win.zIndex === maxZ && !win.minimized;
          return (
            <button key={win.id}
              className={'ww-task-pill' + (active ? ' ww-task-pill--active' : '') + (win.minimized ? ' ww-task-pill--min' : '')}
              onClick={() => handleTask(win.id)}
              title={win.title}>
              {win.title}
            </button>
          );
        })}
      </div>

      {/* ── Center: chat input ─────────────────────────────── */}
      <div className="ww-taskbar-center">
        <ChatBar />
      </div>

      {/* ── Right: health + clock + settings ──────────────── */}
      <div className="ww-taskbar-right">
        <Clock />
        <div className={'ww-health-dot ww-health-dot--' + health.status}
          title={health.model ? `Online · ${health.model}` : health.status} />
        <button className="ww-settings-btn"
          onClick={() => open('settings-main', { title: '⚙️ Settings', component: 'Settings' })}
          title="Settings">
          ⚙️
        </button>
      </div>
    </div>
  );
}