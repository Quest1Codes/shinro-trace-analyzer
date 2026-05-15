import './ApiKeyGuardModal.css';

interface ApiKeyGuardModalProps {
  onGoToSettings: () => void;
  onClose: () => void;
}

export default function ApiKeyGuardModal({ onGoToSettings, onClose }: ApiKeyGuardModalProps) {
  return (
    <div className="key-guard-overlay" onClick={onClose}>
      <div className="key-guard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="key-guard-icon">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="17" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M14 17V12a6 6 0 0 1 12 0v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="20" cy="26" r="2.5" fill="currentColor"/>
          </svg>
        </div>
        <h2 className="key-guard-title">API Key Required</h2>
        <p className="key-guard-desc">
          To analyze a trace, Shinro needs access to an AI provider. Configure an{' '}
          <strong>OpenAI</strong>, <strong>Anthropic</strong>, or{' '}
          <strong>OpenRouter</strong> API key before continuing.
        </p>
        <div className="key-guard-actions">
          <button className="key-guard-btn-primary" onClick={onGoToSettings}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M10 5.5a3 3 0 10-4.5 2.6V11h1.5v-1H8.5v-1H7V8.1A3 3 0 0010 5.5z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Configure AI Keys
          </button>
          <button className="key-guard-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
