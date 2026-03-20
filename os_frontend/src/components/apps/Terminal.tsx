import { useState, useRef, useEffect, useCallback, useId } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  isToolHint?: boolean;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'system',
  content: '⚡ LLM OS Terminal — connected to FastAPI kernel at localhost:8000\nType a prompt and press Enter or click Send.',
};

export default function Terminal(_props: Record<string, unknown>) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [userId] = useState(() => `user-${Math.random().toString(36).slice(2, 8)}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMsg = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback((patch: Partial<Message>) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = { ...next[i], ...patch };
          break;
        }
      }
      return next;
    });
  }, []);

  /**
   * Try streaming via POST /execute/stream → text/event-stream.
   * Falls back to regular POST /execute on 404 or network error.
   */
  const sendPrompt = useCallback(
    async (prompt: string) => {
      setBusy(true);
      const userMsg: Message = { id: `${uid}-${Date.now()}-u`, role: 'user', content: prompt };
      addMsg(userMsg);

      // Placeholder assistant bubble
      const aId = `${uid}-${Date.now()}-a`;
      addMsg({ id: aId, role: 'assistant', content: '', streaming: true });

      try {
        // ── Attempt streaming ────────────────────────────────
        const streamRes = await fetch('/execute/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, user_id: userId }),
          signal: AbortSignal.timeout(120_000),
        });

        if (streamRes.ok && streamRes.body) {
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let assembled = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data:')) {
                const raw = line.slice(5).trim();
                try {
                  const evt = JSON.parse(raw) as {
                    content?: string; tool_hint?: boolean; response?: string;
                  };
                  if (evt.content !== undefined) {
                    assembled += evt.content;
                    updateLastAssistant({
                      content: assembled,
                      isToolHint: evt.tool_hint ?? false,
                    });
                  }
                  if (evt.response !== undefined) {
                    updateLastAssistant({ content: evt.response, streaming: false });
                  }
                } catch { /* skip malformed */ }
              }
            }
          }
          updateLastAssistant({ streaming: false });

        } else {
          // ── Fallback: non-streaming ──────────────────────
          await fallbackExecute(prompt, userId, updateLastAssistant);
        }
      } catch {
        await fallbackExecute(prompt, userId, updateLastAssistant);
      } finally {
        setBusy(false);
      }
    },
    [uid, userId, addMsg, updateLastAssistant],
  );

  const handleSubmit = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    sendPrompt(prompt);
  }, [input, busy, sendPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="terminal">
      {/* ── Message list ───────────────────────────────────────── */}
      <div className="terminal-output">
        {messages.map((msg) => (
          <TerminalMessage key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input row ─────────────────────────────────────────── */}
      <div className="terminal-input-row">
        <span className="terminal-prompt">{'>'}</span>
        <textarea
          ref={inputRef}
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={busy ? 'Agent is thinking…' : 'Enter prompt (Shift+Enter for newline)'}
          disabled={busy}
          rows={1}
          spellCheck={false}
          autoFocus
        />
        <button
          className={`terminal-send${busy ? ' terminal-send--busy' : ''}`}
          onClick={handleSubmit}
          disabled={busy}
          title="Send (Enter)"
        >
          {busy ? '⏳' : '↵'}
        </button>
      </div>
    </div>
  );
}

// ── Fallback non-streaming execute ────────────────────────────
async function fallbackExecute(
  prompt: string,
  userId: string,
  updateLast: (p: Partial<{ content: string; streaming: boolean }>) => void,
) {
  try {
    const res = await fetch('/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, user_id: userId }),
      signal: AbortSignal.timeout(900_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      updateLast({ content: `❌ Error ${res.status}: ${err}`, streaming: false });
      return;
    }
    const data = await res.json() as { response: string };
    updateLast({ content: data.response, streaming: false });
  } catch (err) {
    updateLast({
      content: `❌ ${err instanceof Error ? err.message : 'Request failed'}`,
      streaming: false,
    });
  }
}

// ── Message bubble ───────────────────────────────────────────
function TerminalMessage({ msg }: { msg: Message }) {
  const cls = [
    'term-msg',
    `term-msg--${msg.role}`,
    msg.streaming ? 'term-msg--streaming' : '',
    msg.isToolHint ? 'term-msg--tool' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      {msg.role === 'user' && <span className="term-msg-prefix">you</span>}
      {msg.role === 'assistant' && (
        <span className="term-msg-prefix">
          {msg.isToolHint ? '🔧' : '◈'} llm-os
        </span>
      )}
      <pre className="term-msg-body">
        {msg.content || (msg.streaming ? <BlinkCursor /> : null)}
      </pre>
    </div>
  );
}

function BlinkCursor() {
  return <span className="blink-cursor">▋</span>;
}
