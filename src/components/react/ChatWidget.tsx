import { useEffect, useId, useRef, useState } from 'react';
import { MessageCircle, Minus, RotateCcw, Send, X, UserRound } from 'lucide-react';
import { track } from '../../lib/analytics';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  turnstileSiteKey?: string;
}

const quickReplies = [
  'Which package fits me?',
  'How much does a website cost?',
  'How long will my project take?',
  'I need SEO help',
  'Talk to a person',
];

export default function ChatWidget({ turnstileSiteKey: _turnstileSiteKey }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hi — I’m the Che Xu Studio AI assistant (not a human). I can help you compare packages, pricing ranges, and timelines using our published information. What are you working on?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyAck, setPrivacyAck] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open && !minimized) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [open, minimized, messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        openButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function openChat() {
    setOpen(true);
    setMinimized(false);
    track('chat_opened');
  }

  function clearChat() {
    setMessages([
      {
        role: 'assistant',
        content:
          'Chat cleared. I’m the Che Xu Studio AI assistant — how can I help you choose a package or next step?',
      },
    ]);
    setError(null);
  }

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || loading) return;

    if (/talk to a person|human|real person/i.test(trimmed)) {
      track('human_handoff_requested');
    }

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Chat unavailable');
      }

      // Prefer streaming if body is a stream of text
      if (res.body && res.headers.get('content-type')?.includes('text/plain')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistant = '';
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistant += decoder.decode(value, { stream: true });
          const safe = assistant;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: safe };
            return copy;
          });
        }
      } else {
        const data = (await res.json()) as { reply?: string; error?: string };
        if (!data.reply) throw new Error(data.error || 'No reply');
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply! }]);
      }
    } catch {
      setError('The AI assistant is temporarily unavailable. You can use the contact form instead.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I’m having trouble responding right now. Please use the contact form at /contact and a person from Che Xu Studio will follow up.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          ref={openButtonRef}
          type="button"
          onClick={openChat}
          className="fixed bottom-[calc(var(--mobile-cta-height)+0.75rem)] right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lift md:bottom-6"
          aria-haspopup="dialog"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Chat with AI
        </button>
      )}

      {open && !minimized && (
        <div
          className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[85vh] flex-col rounded-t-[var(--radius-xl)] border border-border bg-white shadow-lift md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,85vh)] md:w-[min(100vw-2rem,26rem)] md:rounded-[var(--radius-xl)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 id={titleId} className="font-display text-lg font-bold text-navy-900">
                Che Xu Studio AI assistant
              </h2>
              <p className="text-xs text-ink-muted">AI — not a human. Answers use published package & FAQ data.</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="icon-btn" onClick={clearChat} aria-label="Clear chat">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" className="icon-btn" onClick={() => setMinimized(true)} aria-label="Minimize chat">
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setOpen(false);
                  openButtonRef.current?.focus();
                }}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!privacyAck && (
            <div className="border-b border-border bg-blue-50 px-4 py-3 text-xs text-ink-muted">
              <p>
                Please don’t share passwords, payment cards, or other sensitive IDs. Chat transcripts are not stored by
                default. If you want a human follow-up, ask first — we’ll only collect contact details with your permission.
                See our <a className="underline" href="/privacy">privacy policy</a>.
              </p>
              <button type="button" className="btn-secondary mt-2 !min-h-9 !px-3 !py-1.5 text-xs" onClick={() => setPrivacyAck(true)}>
                I understand
              </button>
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={
                  m.role === 'user'
                    ? 'ml-8 rounded-[var(--radius-md)] bg-navy-900 px-3 py-2 text-sm text-white'
                    : 'mr-6 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2 text-sm text-ink'
                }
              >
                {m.content}
              </div>
            ))}
            {loading && <p className="text-xs text-ink-muted">Assistant is typing…</p>}
            {error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                {error}{' '}
                <a className="font-semibold underline" href="/contact">
                  Open contact form
                </a>
              </div>
            )}
          </div>

          <div className="border-t border-border px-3 py-2">
            <div className="flex flex-wrap gap-2 pb-2">
              {quickReplies.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-navy-800 hover:border-blue-400"
                  onClick={() => send(q)}
                  disabled={!privacyAck || loading}
                >
                  {q}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="chat-input" className="sr-only">
                Message the AI assistant
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={2}
                maxLength={2000}
                className="min-h-11 flex-1 resize-none rounded-md border border-border px-3 py-2 text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!privacyAck || loading}
                placeholder={privacyAck ? 'Ask about packages, pricing, or timelines…' : 'Acknowledge privacy note to chat'}
              />
              <button type="submit" className="btn-primary !px-3" disabled={!privacyAck || loading || !input.trim()} aria-label="Send message">
                <Send className="h-4 w-4" />
              </button>
            </form>
            <a href="/contact" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-500">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Talk to a person instead
            </a>
          </div>
        </div>
      )}

      {open && minimized && (
        <button
          type="button"
          className="fixed bottom-[calc(var(--mobile-cta-height)+0.75rem)] right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-semibold text-white shadow-lift md:bottom-6"
          onClick={() => setMinimized(false)}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Expand AI chat
        </button>
      )}

      <style>{`
        .icon-btn {
          display: inline-flex;
          min-height: 2.5rem;
          min-width: 2.5rem;
          align-items: center;
          justify-content: center;
          border-radius: 0.5rem;
          border: 1px solid var(--color-border);
        }
      `}</style>
    </>
  );
}
