import { useConversation } from '../context/ConversationContext';
import './HelpPage.css';

export default function HelpPage() {
  const { openSettingsModal } = useConversation();
  return (
    <div className="help-page">
      <div className="help-header">
        <h2 className="help-title">Help & Getting Started</h2>
      </div>

      <div className="help-section">
        <h3 className="help-section-title">Demo Video</h3>
        <div className="help-video-wrap">
          <iframe
            className="help-video-frame"
            src="https://www.youtube-nocookie.com/embed/EkqxxysG9_M?si=UVrEiXXhs7mFX6Cu"
            title="Shinro ClickHouse Query Trace Analyzer Demo"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>

      <div className="help-section">
        <h3 className="help-section-title">Configuring a ClickHouse Connection</h3>
        <p className="help-body">
          Open <strong>Connections</strong> from the sidebar. Enter your ClickHouse HTTP endpoint
          (e.g. <code>http://localhost:8123</code>), username, and optional password, then click{' '}
          <em>Test &amp; Save</em>.
        </p>
      </div>

      <div className="help-section">
        <h3 className="help-section-title">Configuring AI Keys</h3>
        <p className="help-body">
          Open <strong>AI Keys</strong> from the sidebar. Paste your OpenAI, Anthropic, or
          OpenRouter key and select a model.
        </p>
      </div>

      <div className="help-section">
        <h3 className="help-section-title">Using Skills</h3>
        <p className="help-body">
          In the Shinro AI chat, type <code>/</code> to see available skills. Select one or more to
          give the AI specialized context — e.g. <em>Best Practices</em> for performance advice or{' '}
          <em>Architecture Advisor</em> for schema design guidance.
        </p>
      </div>

      <div className="help-section">
        <h3 className="help-section-title">Found a bug or have feedback?</h3>
        <p className="help-body">
          We read every report.{' '}
          <button className="help-inline-link" onClick={() => openSettingsModal('feedback')}>
            Open the feedback form →
          </button>
        </p>
      </div>
    </div>
  );
}
