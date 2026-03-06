'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, ChevronDown, Bot } from 'lucide-react';
import { createConversation } from '@/lib/actions/chat';
import ReactMarkdown from 'react-markdown';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentOption {
  key: string;   // e.g. 'primary_agent'
  name: string;  // e.g. 'EWC'
}

interface Props {
  userId: string;
  agentKey: string;
  agentName: string;
  brandColor: string;
  showAgentSwitcher?: boolean;
  agents?: AgentOption[];
  onAgentChange?: (key: string, name: string) => void;
}

// =============================================================================
// TOOL LABELS
// =============================================================================

const TOOL_LABELS: Record<string, string> = {
  thinking:              'Reasoning...',
  web_search:            'Searching the web',
  knowledge_base_search: 'Searching knowledge base',
  query_signals:         'Querying signals',
  create_signal:         'Proposing signal',
  generate_report:       'Generating report',
  route_to_specialist:   'Delegating to specialist',
  get_available_agents:  'Loading agents',
  run_proactive_scan:    'Running health scan',
};

// =============================================================================
// TYPING DOTS
// =============================================================================

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// CHAT PANEL
// =============================================================================

export function ChatPanel({
  userId,
  agentKey,
  agentName,
  brandColor,
  showAgentSwitcher = false,
  agents = [],
  onAgentChange,
}: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currentAgentKey, setCurrentAgentKey] = useState(agentKey);
  const [currentAgentName, setCurrentAgentName] = useState(agentName);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Sync prop changes (when parent changes agent) ──
  useEffect(() => {
    setCurrentAgentKey(agentKey);
    setCurrentAgentName(agentName);
  }, [agentKey, agentName]);

  // ── Create conversation on mount ──
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const res = await createConversation('clinic', userId, agentKey);
      if (res.success && res.conversationId) setConversationId(res.conversationId);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Switch agent ──
  const handleAgentSwitch = useCallback((key: string, name: string) => {
    setCurrentAgentKey(key);
    setCurrentAgentName(name);
    setDropdownOpen(false);
    onAgentChange?.(key, name);
  }, [onAgentChange]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !conversationId) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setStreamingText('');
    setActiveToolCall(null);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'clinic',
          user_id: userId,
          conversation_id: conversationId,
          message: text,
          agent_scope: currentAgentKey,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: 'Connection error — please try again.',
        }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const event = JSON.parse(payload);
            if (event.type === 'text_delta') {
              accumulated += event.content;
              setStreamingText(accumulated);
            } else if (event.type === 'tool_call') {
              setActiveToolCall(TOOL_LABELS[event.name] || `Using ${event.name}`);
            } else if (event.type === 'tool_result') {
              setActiveToolCall(null);
            } else if (event.type === 'done') {
              setMessages(prev => [...prev, {
                id: `ai-${Date.now()}`, role: 'assistant',
                content: event.response || accumulated,
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            } else if (event.type === 'error') {
              const isOverloaded = (event.content || '').includes('529') || (event.content || '').toLowerCase().includes('overloaded');
              setMessages(prev => [...prev, {
                id: `err-${Date.now()}`, role: 'assistant',
                content: isOverloaded
                  ? 'AI service temporarily overloaded — please wait a moment and try again.'
                  : `Something went wrong: ${event.content}`,
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch {
      if (streamingText) {
        setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant', content: streamingText }]);
      } else {
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Request failed — please try again.' }]);
      }
    } finally {
      setSending(false);
      setStreamingText('');
      setActiveToolCall(null);
    }
  }, [input, sending, conversationId, userId, currentAgentKey, streamingText]);

  const c = brandColor;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Agent switcher / header ── */}
      {showAgentSwitcher && agents.length > 0 ? (
        <div className="flex-shrink-0 px-4 py-3 border-b border-[#D4E2FF]">
          <div className="relative inline-block">
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#D4E2FF] hover:bg-white/[0.07] transition-colors"
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: c }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[12px] text-[#181D23] font-medium">{currentAgentName}</span>
              <ChevronDown size={12} className={`text-[#5A6475] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-[#0d0d0f] border border-white/[0.1] rounded-xl shadow-2xl py-1.5 overflow-hidden"
                  >
                    {agents.map(agent => (
                      <button
                        key={agent.key}
                        onClick={() => handleAgentSwitch(agent.key, agent.name)}
                        className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#F8FAFF] transition-colors flex items-center gap-2 ${
                          agent.key === currentAgentKey ? 'text-[#181D23]' : 'text-[#5A6475]'
                        }`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: agent.key === currentAgentKey ? c : '#96989B' }} />
                        {agent.name}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 px-4 py-3 border-b border-[#D4E2FF] flex items-center gap-2">
          <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }}
            animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
          <span className="text-[11px] text-[#5A6475]">Chat with <span className="text-[#3D4451] font-medium">{currentAgentName}</span></span>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: `${c}12` }}>
              <Bot size={20} style={{ color: `${c}60` }} />
            </div>
            <p className="text-[12px] text-[#5A6475] mb-1">Ask {currentAgentName} anything</p>
            <p className="text-[10px] text-[#96989B] max-w-[200px]">
              Signals, patients, revenue, compliance — {currentAgentName} has full clinic context
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${c}15` }}>
                <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-white/[0.07] text-[#181D23] rounded-tr-md'
                : 'bg-white border border-[#D4E2FF] text-[#181D23] rounded-tl-md'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-slate prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_code]:bg-white [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_strong]:text-[#181D23]">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {(streamingText || activeToolCall || sending) && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ backgroundColor: `${c}15` }}>
              <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }}
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }} />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-white border border-[#D4E2FF]">
              {activeToolCall && (
                <p className="text-[10px] text-[#5A6475] italic mb-1.5 flex items-center gap-1.5">
                  <Loader2 size={10} className="animate-spin" /> {activeToolCall}
                </p>
              )}
              {streamingText ? (
                <div className="text-[12px] text-[#181D23] leading-relaxed prose prose-slate prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                </div>
              ) : (
                <TypingDots color={c} />
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-[#D4E2FF]">
        <div className="flex items-end gap-2 px-3 py-2 rounded-xl border border-[#D4E2FF] bg-white focus-within:border-white/[0.18] transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={`Message ${currentAgentName}...`}
            rows={1}
            className="flex-1 bg-transparent text-[12px] text-[#181D23] placeholder-white/20 outline-none resize-none leading-relaxed"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || !conversationId}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
            style={{ backgroundColor: input.trim() && !sending ? c : 'rgba(0,0,0,0.05)' }}
          >
            {sending
              ? <Loader2 size={13} className="animate-spin text-black" />
              : <Send size={13} className={input.trim() ? 'text-black' : 'text-[#5A6475]'} />
            }
          </button>
        </div>
        <p className="text-[9px] text-[#96989B] text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
