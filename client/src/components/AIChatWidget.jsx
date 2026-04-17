// client/src/components/AIChatWidget.jsx
// Floating AI study assistant — renders on SubtopicPage and StudentDashboard.
// Usage: <AIChatWidget subjectName="Mathematics" subtopicName="Algebra" subjectId="uuid" subtopicId="uuid" />
// Subscription-gated: shows UpgradeWall on 403 free_limit_reached.
// Chat history persisted per session via /api/ai/chat/session + session_id.

import { useState, useRef, useEffect } from 'react';
import api from '../services/apiClient';
import { X, Send, Loader2, Sparkles } from 'lucide-react';
import { UpgradeWall } from '../pages/PricingPage';



// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <Sparkles size={10} className="text-white" />
        </div>
      )}
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-teal-500 text-white rounded-br-sm'
          : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
      }`}>
        {msg.text}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AIChatWidget({
  subjectName  = '',
  subtopicName = '',
  weakTopics   = [],
  subjectId    = null,
  subtopicId   = null,
}) {
  const [open,        setOpen]        = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [upgradeWall, setUpgradeWall] = useState(false);
  const [sessionId,   setSessionId]   = useState(null);
  const [restored,    setRestored]    = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Restore last session on mount ────────────────────────────────────────────
  useEffect(() => {
    if (restored) return;
    const params = {};
    if (subjectId)  params.subject_id  = subjectId;
    if (subtopicId) params.subtopic_id = subtopicId;

    api.get('/ai/chat/session', { params })
      .then(r => {
        if (r.session_id && r.messages?.length > 0) {
          setSessionId(r.session_id);
          setMessages(r.messages.map((m, i) => ({
            id:   i,
            role: m.role === 'assistant' ? 'ai' : 'user',
            text: m.content,
          })));
        }
      })
      .catch(() => {}) // silent — no session is fine
      .finally(() => setRestored(true));
  }, [subjectId, subtopicId]); // eslint-disable-line

  // ── Greet on first open if no restored history ────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0 && restored) {
      const greeting = subjectName
        ? `Hi! I'm AISchoolonair AI . Ask me anything about ${subjectName}${subtopicName ? ` — ${subtopicName}` : ''}, exam tips, or how to tackle tricky questions.`
        : `Hi! I'm AISchoolonair AI . Ask me anything about your studies, exam techniques, or any topic you're finding difficult.`;
      setMessages([{ role: 'ai', text: greeting, id: 0 }]);
    }
  }, [open, restored]); // eslint-disable-line

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Focus input when panel opens ──────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/ai/chat', {
          message:    text,
          session_id: sessionId,
          context: {
            subject_name:  subjectName,
            subtopic_name: subtopicName,
            weak_topics:   weakTopics,
            subject_id:    subjectId,
            subtopic_id:   subtopicId,
          },
        });

      // Save session_id from first response
      if (res.session_id && !sessionId) {
        setSessionId(res.session_id);
      }

      setMessages(prev => [...prev, { role: 'ai', text: res.reply, id: Date.now() + 1 }]);
    } catch (err) {
      if (err.status === 403 && err.error === 'free_limit_reached') {
        setUpgradeWall(true);
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: 'Sorry, I couldn\'t reach the AI right now. Please try again in a moment.',
          id: Date.now() + 1,
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* ── Upgrade wall overlay ── */}
      {upgradeWall && (
        <UpgradeWall onRevise={() => setUpgradeWall(false)} />
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 flex flex-col bg-gray-50 rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ maxHeight: 'min(520px, calc(100vh - 100px))' }}>

          {/* Header */}
          <div className="bg-[#0a4a3f] px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-teal-400/20 flex items-center justify-center">
                <Sparkles size={13} className="text-teal-300" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-none">AISchoolonair AI </p>
                <p className="text-white/40 text-[10px] mt-0.5">Your personal study assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {messages.map(msg => <Message key={msg.id} msg={msg} />)}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                  <Sparkles size={10} className="text-white" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white px-3 py-2.5 flex items-end gap-2 shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              rows={1}
              className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 bg-transparent focus:outline-none leading-relaxed max-h-24 overflow-y-auto"
              style={{ minHeight: '20px' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-full bg-teal-500 hover:bg-teal-600 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
            >
              {loading
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Send size={13} className="text-white" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-4 z-50 w-12 h-12 rounded-full bg-teal-500 hover:bg-teal-600 shadow-lg flex items-center justify-center transition-all active:scale-95"
        aria-label="Open AI study assistant"
      >
        {open
          ? <X size={18} className="text-white" />
          : <Sparkles size={18} className="text-white" />}
      </button>
    </>
  );
}
