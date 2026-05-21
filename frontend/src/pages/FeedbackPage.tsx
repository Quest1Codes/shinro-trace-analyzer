import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import './FeedbackPage.css';

declare global {
  interface Window {
    hbspt?: {
      forms: {
        create: (config: {
          portalId: string;
          formId: string;
          region: string;
          target?: string;
          css?: string;
          cssClass?: string;
        }) => void;
      };
    };
  }
}

const HUBSPOT_SCRIPT = 'https://js-na2.hsforms.net/forms/embed/v2.js';
const PORTAL_ID = '242023157';
const LIGHT_FORM_ID = 'c140120c-46ec-4c43-bc67-4ae5c4e3ba01';
const DARK_FORM_ID = '53901ff3-f6d7-4dfe-9d47-e5b956ec60e8';
const TARGET_ID = 'shinro-feedback-form-host';

export default function FeedbackPage() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);
  const currentFormThemeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const formId = theme === 'dark' ? DARK_FORM_ID : LIGHT_FORM_ID;

    if (currentFormThemeRef.current === theme && containerRef.current?.innerHTML) return;
    currentFormThemeRef.current = theme;

    const renderForm = () => {
      if (cancelled || !window.hbspt || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      try {
        window.hbspt.forms.create({
          portalId: PORTAL_ID,
          formId,
          region: 'na2',
          target: `#${TARGET_ID}`,
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    if (window.hbspt) {
      renderForm();
      return () => { cancelled = true; };
    }

    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${HUBSPOT_SCRIPT}"]`,
    );
    if (!script) {
      script = document.createElement('script');
      script.src = HUBSPOT_SCRIPT;
      script.charset = 'utf-8';
      script.async = true;
      script.onload = renderForm;
      script.onerror = () => { if (!cancelled) setLoadError(true); };
      document.body.appendChild(script);
    } else {
      script.addEventListener('load', renderForm);
    }

    return () => {
      cancelled = true;
    };
  }, [theme]);

  return (
    <div className="feedback-page">
      <div className="feedback-header">
        <h2 className="feedback-title">Feedback & Bug Reports</h2>
        <p className="feedback-desc">
          Found a bug, hit an unexpected error, or have an idea? Share it below — every
          submission goes straight to the{' '}
          <a
            href="https://quest1.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="feedback-link"
          >
            Quest1
          </a>{' '}
          team and helps shape the next release.
        </p>
      </div>

      <div className="feedback-card">
        {loadError ? (
          <div className="feedback-error">
            <p>
              The feedback form couldn't be loaded. Please check your connection or
              email{' '}
              <a href="mailto:support@quest1.com" className="feedback-link">
                support@quest1.com
              </a>{' '}
              directly.
            </p>
          </div>
        ) : (
          <div id={TARGET_ID} ref={containerRef} className="feedback-form-host" />
        )}
      </div>

      <p className="feedback-footnote">
        We never store sensitive query data submitted through this form. Trace logs
        and credentials always remain on your machine.
      </p>
    </div>
  );
}
