import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'error';
    content: string;
    streaming?: boolean;
}

// ── Floating panel rendered via portal into document.body ─────
function ChatPanel({
    messages, busy, minimized, pos,
    onPointerDown, onPointerMove, onPointerUp,
    onMinimize, onClear, onClose,
    bottomRef,
}: {
    messages: Message[];
    busy: boolean;
    minimized: boolean;
    pos: { x: number; y: number };
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
    onMinimize: () => void;
    onClear: () => void;
    onClose: () => void;
    bottomRef: React.RefObject<HTMLDivElement>;
}) {
    return createPortal(
        <div
            style={{
                position: 'fixed',
                left: pos.x,
                top: pos.y,
                width: 440,
                maxWidth: 'calc(100vw - 40px)',
                zIndex: 999999,
                borderRadius: 20,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.98)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px rgba(99,102,241,0.15)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: minimized ? 52 : 480,
                transition: 'max-height 0.25s ease, box-shadow 0.15s',
            }}
        >
            {/* ── Title bar / drag handle ──────────────────────── */}
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: minimized ? 'none' : '1px solid rgba(0,0,0,0.07)',
                    background: 'rgba(248,249,255,0.95)',
                    cursor: 'grab',
                    userSelect: 'none',
                    flexShrink: 0,
                    position: 'relative',
                }}
            >
                {/* top accent line */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, transparent)',
                    borderRadius: '20px 20px 0 0',
                }} />

                <span style={{
                    fontSize: 13, fontWeight: 600, color: '#1a1a2e',
                    fontFamily: "'DM Sans', sans-serif",
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    {busy
                        ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span> Thinking…</>
                        : <>◈ AI Assistant</>
                    }
                </span>

                <div style={{ display: 'flex', gap: 4 }}>
                    {/* Minimize */}
                    <button onClick={onMinimize}
                        style={btnStyle('#f59e0b')}
                        title={minimized ? 'Expand' : 'Minimize'}>
                        {minimized ? '□' : '─'}
                    </button>
                    {/* Delete */}
                    <button onClick={onClear}
                        style={btnStyle('#ef4444')}
                        title="Delete all messages">
                        🗑
                    </button>
                    {/* Close */}
                    <button onClick={onClose}
                        style={btnStyle('#6b7280')}
                        title="Close panel">
                        ✕
                    </button>
                </div>
            </div>

            {/* ── Messages ─────────────────────────────────────── */}
            {!minimized && (
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                    {messages.map(msg => (
                        <div key={msg.id} style={{
                            display: 'flex', flexDirection: 'column', gap: 3,
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        }}>
                            <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', opacity: 0.5,
                                fontFamily: "'DM Sans', sans-serif",
                                color: msg.role === 'user' ? '#6366f1' : msg.role === 'error' ? '#ef4444' : '#10b981',
                            }}>
                                {msg.role === 'user' ? 'You' : 'AI'}
                            </span>
                            <pre style={{
                                fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word', fontFamily: "'DM Sans', sans-serif",
                                color: msg.role === 'error' ? '#ef4444' : '#1a1a2e',
                                background: msg.role === 'user'
                                    ? 'linear-gradient(135deg, #ede9fe, #ddd6fe)'
                                    : 'rgba(0,0,0,0.04)',
                                borderRadius: msg.role === 'user' ? '14px 14px 3px 14px' : '3px 14px 14px 14px',
                                padding: '8px 12px',
                                maxWidth: '92%',
                                margin: 0,
                            }}>
                                {msg.content || (msg.streaming
                                    ? <span style={{ color: '#6366f1', animation: 'blink 1s step-end infinite' }}>▋</span>
                                    : null
                                )}
                            </pre>
                            {msg.streaming && msg.content && (
                                <span style={{ color: '#6366f1', animation: 'blink 1s step-end infinite', fontSize: 13 }}>▋</span>
                            )}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )}
        </div>,
        document.body,
    );
}

function btnStyle(_hoverColor: string) {
    return {
        width: 28, height: 26, borderRadius: 7,
        fontSize: 12, color: '#6b7280',
        background: 'rgba(0,0,0,0.05)',
        border: '1px solid rgba(0,0,0,0.07)',
        cursor: 'pointer',
        display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
        transition: 'background 0.12s',
        fontFamily: 'inherit',
    };
}

// ── Main ChatBar component ─────────────────────────────────────
export default function ChatBar() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [busy, setBusy] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
    const [positioned, setPositioned] = useState(false);

    const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const userId = useRef('user-' + Math.random().toString(36).slice(2, 8));

    // Scroll to bottom on new messages
    useEffect(() => {
        if (!minimized) {
            const t = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
            return () => clearTimeout(t);
        }
    }, [messages, minimized]);

    const openPanel = useCallback(() => {
        if (!positioned) {
            setPanelPos({
                x: Math.round(window.innerWidth / 2 - 220),
                y: Math.round(window.innerHeight / 2 - 240),
            });
            setPositioned(true);
        }
        setPanelOpen(true);
        setMinimized(false);
    }, [positioned]);

    const updateLast = useCallback((patch: Partial<Message>) => {
        setMessages(prev => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant' || next[i].role === 'error') {
                    next[i] = { ...next[i], ...patch };
                    break;
                }
            }
            return next;
        });
    }, []);

    const send = useCallback(async () => {
        const prompt = input.trim();
        if (!prompt || busy) return;
        setInput('');
        openPanel();
        setBusy(true);
        const uid = Date.now().toString();
        setMessages(prev => [
            ...prev,
            { id: uid + '-u', role: 'user', content: prompt },
            { id: uid + '-a', role: 'assistant', content: '', streaming: true },
        ]);
        try {
            const res = await fetch('/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, user_id: userId.current }),
                signal: AbortSignal.timeout(900_000),
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json() as { response: string };
            updateLast({ content: data.response, streaming: false });
        } catch (err) {
            updateLast({
                content: err instanceof Error ? err.message : 'Request failed',
                streaming: false, role: 'error',
            });
        } finally { setBusy(false); }
    }, [input, busy, updateLast, openPanel]);

    const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
    }, [send]);

    // Drag handlers
    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { mx: e.clientX, my: e.clientY, px: panelPos.x, py: panelPos.y };
    }, [panelPos]);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        setPanelPos({
            x: Math.max(0, Math.min(window.innerWidth - 440, dragRef.current.px + e.clientX - dragRef.current.mx)),
            y: Math.max(0, Math.min(window.innerHeight - 52, dragRef.current.py + e.clientY - dragRef.current.my)),
        });
    }, []);

    const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

    const clearAll = useCallback(() => {
        setMessages([]); setPanelOpen(false);
        setMinimized(false); setPositioned(false);
    }, []);

    const assistantCount = messages.filter(m => m.role === 'assistant').length;

    return (
        <>
            {/* Portal-rendered panel — escapes all overflow/clip parents */}
            {panelOpen && messages.length > 0 && (
                <ChatPanel
                    messages={messages}
                    busy={busy}
                    minimized={minimized}
                    pos={panelPos}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onMinimize={() => setMinimized(m => !m)}
                    onClear={clearAll}
                    onClose={() => setPanelOpen(false)}
                    bottomRef={bottomRef}
                />
            )}

            {/* Pill input bar */}
            <div className={'ww-chat-pill' + (busy ? ' ww-chat-pill--busy' : '')}>
                <input
                    className="ww-chat-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    onFocus={() => { if (messages.length > 0) openPanel(); }}
                    placeholder={busy ? 'Thinking…' : 'Ask something'}
                    disabled={busy}
                    spellCheck={false}
                    autoComplete="off"
                />
                {assistantCount > 0 && (
                    <button className="ww-chat-toggle"
                        onClick={() => {
                            if (!panelOpen) openPanel();
                            else if (minimized) setMinimized(false);
                            else setMinimized(true);
                        }}>
                        {panelOpen && !minimized ? '▼' : '▲'} {assistantCount}
                    </button>
                )}
                <button className="ww-chat-send"
                    onClick={send} disabled={busy || !input.trim()} title="Send (Enter)">
                    {busy ? <span className="ww-spin">◌</span> : '↵'}
                </button>
            </div>
        </>
    );
}