import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Zap, Info, BookText } from 'lucide-react';
import type { LLMProvider, ToolCallInfo, ChatMessage } from '../types';
import { streamChat, getAIKeyStatus } from '../services/aiService';

import { useTheme } from '../context/ThemeContext';
import { useTrace } from '../context/TraceContext';
import { useConversation } from '../context/ConversationContext';
import { Quest1Loader } from '../components/Quest1Loader';
import { AVAILABLE_SKILLS, type AgentSkill } from '../constants/skills';

import 'highlight.js/styles/github-dark.css';
import './ShinroAI.css';

function formatErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('authentication_error') || lower.includes('invalid x-api-key') || lower.includes('invalid api key') || lower.includes('incorrect api key') || lower.includes('401'))
    return 'Authentication failed. Please check your API key in Settings.';
  if (lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('429'))
    return 'Rate limit exceeded. Please wait a moment and try again.';
  if (lower.includes('insufficient_quota') || lower.includes('quota'))
    return 'API quota exceeded. Please check your billing or plan limits.';
  if (lower.includes('model_not_found') || lower.includes('model not found'))
    return 'The selected model was not found. Please choose a different model.';
  if (lower.includes('overloaded') || lower.includes('503'))
    return 'The AI service is temporarily overloaded. Please try again shortly.';
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'The request timed out. Please try again.';
  try { JSON.parse(raw); return 'Something went wrong. Please try again.'; } catch {}
  if (raw.length > 200) return 'Something went wrong. Please try again.';
  return raw;
}

const ALL_PROVIDERS: LLMProvider[] = ['openai', 'anthropic', 'openrouter'];

const PROVIDER_LABEL: Record<LLMProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
};


function ProviderIcon({ provider }: { provider: LLMProvider }) {
  if (provider === 'openai') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.34 7.896zm16.597 3.855l-5.843-3.369 2.02-1.168a.076.076 0 01.071 0l4.83 2.791a4.494 4.494 0 01-.676 8.105v-5.678a.79.79 0 00-.402-.681zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.83-2.787a4.5 4.5 0 016.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08-4.778 2.758a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    );
  }
  if (provider === 'anthropic') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.52zm4.132 10.455L8.453 7.687 6.205 13.975h4.496z"/>
      </svg>
    );
  }

  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.547 2.853l-.977 1.699 1.334.77-1.552 2.686-1.336-.77-.975 1.699 1.334.77-2.143 3.709-1.785-1.03a5.027 5.027 0 00-.506 2.222c0 2.75 2.186 4.979 4.918 4.979s4.918-2.229 4.918-4.979V9.63l1.95.002V14.1c0 3.813-3.036 6.9-6.776 6.9s-6.775-3.087-6.775-6.9a6.98 6.98 0 01.73-3.143L7.6 9.63l2.924-5.067 1.336.77L12.834 3.8 11.5 3.028l.975-1.7 1.332.77L14.781 0l1.332.77-.977 1.699 1.41.813v-.428zM3.455 9.63H1.5v4.467c0 3.813 3.036 6.9 6.776 6.9a6.702 6.702 0 003.21-.814l-.977-1.699a4.763 4.763 0 01-2.233.555c-2.732 0-4.918-2.229-4.918-4.979V9.63z"/>
    </svg>
  );
}



function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M2 10V2.5A.5.5 0 012.5 2H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}



function stripToolCallXml(content: string): string {
  return content
    .replace(/<clickhouse_tools>[\s\S]*?<\/clickhouse_tools>/gi, '')
    .replace(/<\/?clickhouse_tools[^>]*>/gi, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
    .replace(/<parameter[\s\S]*?<\/parameter>/gi, '')
    .trim();
}

function normalizeMarkdown(text: string): string {

  const out = text.replace(/([^\n])(#{1,6} )/g, '$1\n\n$2');


  const lines = out.split('\n');
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];


    if (/^[-*+]\s*$/.test(line)) continue;

    result.push(line);


    if (/^#{1,6} /.test(line)) {
      if (i + 1 < lines.length && lines[i + 1] !== '') {
        result.push('');
      }
    }
  }

  return result.join('\n');
}



const THINKING_PHRASES = /^(i need to|i should|i will|i'll|first,?\s*i'll|let me (check|query|search|look|call|fetch|run|analyze|see|get|find|dig|investigate)|now let me|checking|analyzing|let's (check|query|search|look|call|fetch|run|analyze|see|get|find|dig|investigate)|to (start|begin|answer|analyze)|looking at)/i;

function isThinkingLine(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return true;
  if (/^```|^[-*+]\s|^\d+\.\s|^\*\*|^>/.test(s)) return false;
  return THINKING_PHRASES.test(s);
}

function splitContent(text: string, hasToolCalls: boolean, isStreaming: boolean): { thinking: string; body: string } {
  const norm = normalizeMarkdown(text);
  const headingMatch = norm.match(/(^|\n)(#{1,6} )/m);

  let preHeading = '';
  let afterHeading = '';

  if (headingMatch && headingMatch.index !== undefined) {
    const splitAt = headingMatch.index + (headingMatch[1] === '\n' ? 1 : 0);
    preHeading = norm.slice(0, splitAt).trim();
    afterHeading = norm.slice(splitAt).trim();
  } else {
    preHeading = norm.trim();
    afterHeading = '';
  }


  if (!isStreaming && !hasToolCalls) {
    return { thinking: '', body: norm.trim() };
  }


  if (hasToolCalls) {
    if (headingMatch) {
      return { thinking: preHeading, body: afterHeading };
    }

    if (!isStreaming) {
      return { thinking: '', body: norm.trim() };
    }
    return { thinking: norm.trim(), body: '' };
  }


  const sentences = preHeading.split(/(?<=[.!?:])\s+|\n/).map(s => s.trim()).filter(Boolean);
  const allThinking = sentences.length > 0 && sentences.every(isThinkingLine);

  if (allThinking) {
    return { thinking: preHeading, body: afterHeading };
  }

  return { thinking: '', body: norm.trim() };
}



function ThinkingBlock({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen(!open)}>
        <svg
          className={`thinking-chevron ${open ? 'open' : ''}`}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="thinking-label">
          {isStreaming ? 'Thinking…' : 'Thought process'}
        </span>
      </button>
      {open && (
        <div className="thinking-content">
          {text}
        </div>
      )}
    </div>
  );
}



function MarkdownContent({ content }: { content: string }) {
  const normalized = normalizeMarkdown(content);

  return (
    <div className="md-content">
      <ReactMarkdown
        children={normalized}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{

          pre({ children, ...props }) {
            const extractText = (node: ReactNode): string => {
              if (typeof node === 'string') return node;
              if (Array.isArray(node)) return node.map(extractText).join('');
              if (node && typeof node === 'object' && 'props' in node) {
                return extractText((node as any).props.children);
              }
              return '';
            };
            const codeText = extractText(children);

            let lang = '';
            if (children && typeof children === 'object' && 'props' in (children as any)) {
              const cls = (children as any).props.className || '';
              const m = cls.match(/language-(\w+)/);
              if (m) lang = m[1];
            }

            return (
              <div className="md-code-block">
                <div className="md-code-header">
                  <span className="md-code-lang">{lang || 'code'}</span>
                  <CopyButton text={codeText.trim()} />
                </div>
                <pre {...props}>{children}</pre>
              </div>
            );
          },

          code({ children, className, ...props }) {
            if (className) {
              return <code className={className} {...props}>{children}</code>;
            }
            return <code className="md-inline-code" {...props}>{children}</code>;
          },

          table({ children, ...props }) {
            return (
              <div className="md-table-wrap">
                <table className="md-table" {...props}>{children}</table>
              </div>
            );
          },
        }}
      />
    </div>
  );
}



function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <span className={`tool-call-chip ${toolCall.isLoading ? 'loading' : 'complete'}`}>
      <button className="tool-call-chip-btn" onClick={() => setExpanded(!expanded)}>
        {toolCall.isLoading ? (
          <span className="tool-spinner" />
        ) : (
          /* terminal / function icon */
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="tool-call-fn-icon">
            <path d="M2 3.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        )}
        <span className="tool-call-fn-name">{toolCall.name}</span>
        <svg className={`tool-call-arrow ${expanded ? 'open' : ''}`} width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {expanded && (
        <div className="tool-call-detail">
          <div className="tool-call-detail-section">
            <span className="tool-call-detail-label">Arguments</span>
            <pre className="tool-call-detail-code">{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.result && (
            <div className="tool-call-detail-section">
              <span className="tool-call-detail-label">Result</span>
              <pre className="tool-call-detail-code">{toolCall.result}</pre>
            </div>
          )}
        </div>
      )}
    </span>
  );
}



function ChatInput({ 
  value, 
  onChange, 
  onKeyDown, 
  disabled, 
  placeholder, 
  queryIds,
  onSlashCommand,
  showSkillDropdown,
  skillFilter
}: { 
  value: string, 
  onChange: (val: string) => void, 
  onKeyDown: (e: React.KeyboardEvent) => void, 
  disabled?: boolean, 
  placeholder?: string,
  queryIds: string[],
  onSlashCommand: (show: boolean, filter: string) => void,
  showSkillDropdown: boolean,
  skillFilter: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    syncScroll();
  };

  const syncScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(autoResize, [value]);

  const handleUpdate = (val: string) => {
    onChange(val);
    const cursor = textareaRef.current?.selectionStart || 0;

    // Detect slash command
    const slashMatch = val.slice(0, cursor).match(/(?:^|\s)\/([\w-]*)$/);
    if (slashMatch) {
      onSlashCommand(true, slashMatch[1]);
      setSuggestions([]);
      setMentionStart(-1);
      return;
    } else {
      onSlashCommand(false, '');
    }

    // Detect @ mention
    const lastAt = val.lastIndexOf('@', cursor - 1);
    if (lastAt !== -1) {
      const textAfter = val.slice(lastAt + 1, cursor);
      if (!/\s/.test(textAfter)) {
        const matches = queryIds.filter(id => id.startsWith(textAfter));
        setSuggestions(matches);
        setMentionStart(lastAt);
        setSuggestionIdx(0);
        return;
      }
    }
    setSuggestions([]);
    setMentionStart(-1);
  };

  const applyId = (id: string) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const newVal = before + '@' + id + ' ' + after;
    onChange(newVal);
    setSuggestions([]);
    setMentionStart(-1);
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionStart + id.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
        syncScroll();
      }
    }, 0);
  };

  const handleKeys = (e: React.KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIdx(p => (p + 1) % suggestions.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIdx(p => (p - 1 + suggestions.length) % suggestions.length); }
      else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applyId(suggestions[suggestionIdx]); }
      else if (e.key === 'Escape') { setSuggestions([]); setMentionStart(-1); }
      return;
    }
    onKeyDown(e);
  };

  // Mirrored background rendering for highlighting
  const renderValue = () => {
    // Match @ followed by UUID trace ID
    const traceIdRegex = /(@[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    const parts = [];
    let lastIdx = 0;
    let match;
    
    while ((match = traceIdRegex.exec(value)) !== null) {
      parts.push(value.slice(lastIdx, match.index));
      const fullMatch = match[1];
      parts.push(
        <span key={match.index} className="mention-pill">
          {fullMatch}
        </span>
      );
      lastIdx = traceIdRegex.lastIndex;
    }
    parts.push(value.slice(lastIdx));
    return parts;
  };

  return (
    <div className="chat-input-box-wrapper">
      {suggestions.length > 0 && (
        <div className="id-suggestions-dropdown">
          {suggestions.map((id, idx) => (
            <button key={id} className={`id-suggestion-item ${idx === suggestionIdx ? 'active' : ''}`} onClick={() => applyId(id)}>
              <Zap size={10} strokeWidth={2.5} fill="currentColor" />
              <span className="id-suggestion-text">{id}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={overlayRef} className="mention-overlay">{renderValue()}</div>
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        value={value}
        onChange={e => handleUpdate(e.target.value)}
        onKeyDown={handleKeys}
        onScroll={syncScroll}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
      />
    </div>
  );
}



export default function ShinroAI() {

  const { theme } = useTheme();
  const { chatMessages: messages, setChatMessages: setMessages, queryId, queryIds, persistMessage, traceSuggestions } = useTrace();
  const { initialPrompt, setInitialPrompt } = useConversation();

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [hasKey, setHasKey] = useState<Awaited<ReturnType<typeof getAIKeyStatus>>>({
    openai: false,
    anthropic: false,
    openrouter: false,
  });
  const [loaded, setLoaded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userHasScrolledUp = useRef(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');

  // Slash-command skill selection
  const [activeSkills, setActiveSkills] = useState<AgentSkill[]>([]);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [skillHighlight, setSkillHighlight] = useState(0);
  const [skillFilter, setSkillFilter] = useState('');

  useEffect(() => {
    getAIKeyStatus()
      .then((status) => {
        setHasKey(status);
        if (status.openrouter) { setProvider('openrouter'); setSelectedModel(status.openrouterModel || ''); }
        else if (status.openai) { setProvider('openai'); setSelectedModel(status.openaiModel || ''); }
        else if (status.anthropic) { setProvider('anthropic'); setSelectedModel(status.anthropicModel || ''); }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const modelKey = `${provider}Model` as keyof typeof hasKey;
    setSelectedModel((hasKey[modelKey] as string) || '');
  }, [provider, hasKey]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
    userHasScrolledUp.current = !isAtBottom;
  }, []);

  useEffect(() => {
    if (!userHasScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (loaded && initialPrompt && queryId) {
      const p = initialPrompt; setInitialPrompt(''); 
      handleSend(p);
    }
  }, [loaded, initialPrompt, queryId]); 

  const handleSend = async (overrideText?: string) => {
    const text = typeof overrideText === 'string' ? overrideText : input.trim();
    if (!text || isStreaming) return;
    if (!hasKey[provider]) return;

    const activeModel = selectedModel || (hasKey[`${provider}Model` as keyof typeof hasKey] as string) || '';
    const skillIds = activeSkills.map((s) => s.id);

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: text,
      timestamp: new Date().toISOString(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg = {
      id: assistantId,
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      toolCalls: [] as ToolCallInfo[],
      metadata: { provider },
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      await streamChat(history, provider, activeModel, {
        onToken: (token) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token } : m));
        },
        onToolCall: (name, args) => {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), { name, args, isLoading: true }] } : m,
          ));
        },
        onToolResult: (name, result) => {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, toolCalls: (m.toolCalls || []).map((tc) =>
              tc.name === name && tc.isLoading ? { ...tc, result, isLoading: false } : tc,
            )} : m,
          ));
        },
        onDone: () => {
          setMessages((prev) => {
            const final = prev.map((m) => m.id === assistantId ? { ...m, isStreaming: false } : m);
            const ast = final.find((m) => m.id === assistantId);
            persistMessage('user', text);
            if (ast) persistMessage('assistant', ast.content, ast.toolCalls);
            return final;
          });
          setIsStreaming(false);
        },
        onError: (err) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: formatErrorMessage(err), isStreaming: false } : m));
          setIsStreaming(false);
        },
      }, queryId, skillIds);
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: formatErrorMessage(err.message || 'Connection error'), isStreaming: false } : m));
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash-command keyboard navigation
    if (showSkillDropdown) {
      const filtered = AVAILABLE_SKILLS.filter(
        (s) => !activeSkills.some((a) => a.id === s.id) &&
          s.label.toLowerCase().includes(skillFilter.toLowerCase())
      );
      if (e.key === 'ArrowDown') { e.preventDefault(); setSkillHighlight((h) => Math.min(h + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSkillHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[skillHighlight]) {
          setActiveSkills((prev) => [...prev, filtered[skillHighlight]]);
        }
        setShowSkillDropdown(false);
        setSkillFilter('');
        // Remove the slash text from input
        setInput((prev) => prev.replace(/\/\S*$/, ''));
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowSkillDropdown(false); setSkillFilter(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };


  const selectSkill = (skill: AgentSkill) => {
    setActiveSkills((prev) =>
      prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
    );
    setShowSkillDropdown(false);
    setSkillFilter('');
    setInput((prev) => prev.replace(/\/[\w-]*$/, ''));
  };

  const removeSkill = (id: string) => {
    setActiveSkills((prev) => prev.filter((s) => s.id !== id));
  };

  const noKey = loaded && !hasKey.openai && !hasKey.anthropic && !hasKey.openrouter;
  const currentKeyMissing = loaded && !hasKey[provider];

  useEffect(() => {
    const close = () => {
      setShowProviderDropdown(false);
      setShowModelDropdown(false);
      setShowSkillDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const activeModelLabel = selectedModel || PROVIDER_LABEL[provider];

  return (
    <div className={`shinro-ai-page ${theme}`}>
      <div className="chat-scroll-area" ref={scrollAreaRef} onScroll={handleScroll}>

        {messages.length === 0 && !noKey && (
          <div className="chat-empty-state">
            <div className="empty-avatar">
              <Quest1Loader isLoading={false} size={48} />
            </div>
            <div className="empty-greeting">
              <span className="empty-greeting-text">I'm Shinro. I dig into ClickHouse query traces and tell you what's actually slow.</span>
            </div>
            <h2 className="empty-title">How can I help you today?</h2>

            {traceSuggestions === null ? (
              <div className="suggestions-loading">
                <span className="suggestions-spinner" />
                <span className="suggestions-loading-text">Generating tailored questions…</span>
              </div>
            ) : (
              <div className="empty-suggestions">
                {(traceSuggestions.length > 0 ? traceSuggestions : [
                  'Analyze for bottlenecks',
                  'Execution plan breakdown',
                  'Index recommendations',
                  'Resource usage summary',
                ]).map((s) => (
                  <button key={s} className="suggestion-chip" onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="messages-list">
          {messages.map((msg) => (
            <div key={msg.id} className={`msg-row msg-${msg.role}`}>
              {msg.role === 'user' ? (
                <div className="msg-user">
                  <div className="msg-user-bubble">
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
              ) : (
                <div className="msg-assistant">
                  <div className="msg-assistant-avatar">
                    <Quest1Loader isLoading={msg.isStreaming} size={22} />
                  </div>
                  <div className="msg-assistant-body">
                    <div className="msg-assistant-meta">
                      <span className="msg-assistant-name">Shinro AI</span>
                    </div>
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="tool-calls-group">
                        {msg.toolCalls.map((tc, idx) => <ToolCallBlock key={`${tc.name}-${idx}`} toolCall={tc} />)}
                      </div>
                    )}
                    {msg.content && (() => {
                      const hasToolCalls = (msg.toolCalls?.length || 0) > 0;
                      const cleaned = stripToolCallXml(msg.content);
                      if (!cleaned) return null;
                      const { thinking, body } = splitContent(cleaned, hasToolCalls, !!msg.isStreaming);
                      return (
                        <>
                          {thinking && <ThinkingBlock text={thinking} isStreaming={msg.isStreaming} />}
                          {body && <MarkdownContent content={body} />}
                          {!body && !thinking && <MarkdownContent content={cleaned} />}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>


      <div className="chat-input-area">
        <div className="chat-input-box" onMouseDown={(e) => e.stopPropagation()}>
          <div className="input-top-row">

            <div className="provider-chip-wrap" onMouseDown={(e) => e.stopPropagation()}>
              <button className="provider-chip"
                onClick={() => { setShowProviderDropdown(!showProviderDropdown); setShowModelDropdown(false); }}
                disabled={isStreaming}>
                <span className="provider-chip-icon"><ProviderIcon provider={provider} /></span>
                {PROVIDER_LABEL[provider]}
                {hasKey[provider] && <span className="provider-key-dot" />}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M2 3l2 2 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </button>
              {showProviderDropdown && (
                <div className="provider-dropdown">
                  {ALL_PROVIDERS.map((p) => (
                    <button key={p}
                      className={`provider-dropdown-item ${p === provider ? 'active' : ''} ${!hasKey[p] ? 'disabled' : ''}`}
                      onClick={() => { if (hasKey[p]) { setProvider(p); } setShowProviderDropdown(false); }}>
                      <span className="pdi-icon"><ProviderIcon provider={p} /></span>
                      <span className="pdi-label">{PROVIDER_LABEL[p]}</span>
                      {hasKey[p]
                        ? <span className="pdi-status configured">configured</span>
                        : <span className="pdi-status missing">no key</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="input-top-divider" />

            <div className="model-chip-wrap" onMouseDown={(e) => e.stopPropagation()}>
              <button className="model-chip"
                onClick={() => { setShowModelDropdown(!showModelDropdown); setShowProviderDropdown(false); }}
                disabled={isStreaming || !hasKey[provider]}>
                <span className="model-chip-label">{activeModelLabel}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M2 3l2 2 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </button>
              {showModelDropdown && hasKey[provider] && (
                <div className="model-dropdown">
                  {(hasKey[`${provider}Models` as keyof typeof hasKey] as string[] | undefined
                    || (provider === 'openai' ? ['gpt-5.5','gpt-5.4','gpt-5.4-mini','gpt-4.1','gpt-4.1-mini']
                        : provider === 'anthropic' ? ['claude-sonnet-4-6','claude-opus-4-7','claude-haiku-4-5-20251001']
                        : ['anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.7','anthropic/claude-haiku-4.5','openai/gpt-5.5','openai/gpt-5.5-pro','openai/gpt-5.4','openai/gpt-5.4-pro','openai/gpt-5.3-codex','openai/gpt-5.2','openai/gpt-5.2-pro','openai/gpt-5.2-codex'])
                  ).map((m: string) => (
                    <button key={m}
                      className={`model-dropdown-item ${m === selectedModel ? 'active' : ''}`}
                      onClick={() => { setSelectedModel(m); setShowModelDropdown(false); }}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="input-top-divider" />
            <div className="skill-trigger-wrap" onMouseDown={(e) => e.stopPropagation()}>
              <button className={`skill-trigger-btn ${activeSkills.length > 0 ? 'active' : ''}`}
                onClick={() => {
                  setShowSkillDropdown(!showSkillDropdown);
                  setSkillFilter('');
                  setSkillHighlight(0);
                }}
                disabled={isStreaming}
                title="Agent Skills">
                <BookText size={14} strokeWidth={2} />
                {activeSkills.length > 0 && <span className="skill-count-badge">{activeSkills.length}</span>}
              </button>
            </div>

            <div className="input-spacer" />
          </div>

          <ChatInput
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || noKey}
            placeholder={currentKeyMissing ? `No ${PROVIDER_LABEL[provider]} key — click the key icon to configure` : 'Ask Shinro AI anything... (type @ for IDs, / for skills)'}
            queryIds={queryIds}
            onSlashCommand={(show, filter) => {
              setShowSkillDropdown(show);
              setSkillFilter(filter);
              if (show) setSkillHighlight(0);
            }}
            showSkillDropdown={showSkillDropdown}
            skillFilter={skillFilter}
          />

          {/* Slash-command dropdown */}
          {showSkillDropdown && (() => {
            const filtered = AVAILABLE_SKILLS.filter(
              (s) => !activeSkills.some((a) => a.id === s.id) &&
                s.label.toLowerCase().includes(skillFilter.toLowerCase())
            );
            if (filtered.length === 0) return null;
            return (
              <div className="skill-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                <div className="skill-dropdown-header">Agent Skills</div>
                {filtered.map((skill, idx) => (
                  <button
                    key={skill.id}
                    className={`skill-dropdown-item ${idx === skillHighlight ? 'highlighted' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); selectSkill(skill); }}
                    onMouseEnter={() => setSkillHighlight(idx)}
                  >
                    <span className="skill-dropdown-label">
                      <BookText size={12} strokeWidth={2.5} className="skill-icon" />
                      {skill.label}
                    </span>
                    <span className="skill-dropdown-desc">{skill.description}</span>
                  </button>
                ))}
              </div>
            );
          })()}

          <div className="input-bottom-row">
            {/* Active skill chips */}
            {activeSkills.length > 0 && (
              <div className="skill-chips">
                {activeSkills.map((skill) => (
                  <span key={skill.id} className="skill-chip">
                    <BookText size={10} strokeWidth={2.5} className="skill-chip-icon" />
                    {skill.label}
                    <button className="skill-chip-remove" onClick={() => removeSkill(skill.id)}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <span className="input-hint-text"></span>
            <button className="send-btn" onClick={() => handleSend()}
              disabled={isStreaming || !input.trim() || currentKeyMissing}>
              {isStreaming ? <span className="send-spinner" /> : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13V3l10 5-10 5z" fill="currentColor"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="chat-disclaimer">Shinro AI can make mistakes. Please verify suggestions for correctness.</p>
      </div>
    </div>
  );
}
