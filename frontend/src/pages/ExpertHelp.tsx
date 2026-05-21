import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import './ExpertHelp.css';

const LIGHT_FORM_ID = 'e25c1093-d6d3-4eb4-917a-18d8a2f628e6';
const DARK_FORM_ID = '9aa55640-b96d-496d-a148-113e1a5e3d62';

export default function ExpertHelp() {
  const { theme } = useTheme();
  const scriptLoadedRef = useRef(false);
  const currentFormThemeRef = useRef<string | null>(null);

  useEffect(() => {
    const formId = theme === 'dark' ? DARK_FORM_ID : LIGHT_FORM_ID;

    if (currentFormThemeRef.current === theme) return;
    currentFormThemeRef.current = theme;

    const container = document.getElementById('expert-help-hs-form');
    if (container) container.innerHTML = '';

    const injectForm = () => {
      window.hbspt?.forms.create({
        portalId: '242023157',
        formId,
        region: 'na2',
        target: '#expert-help-hs-form',
        css: '',
        cssClass: 'expert-hs-form',
      });
    };

    if (window.hbspt) {
      injectForm();
    } else if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '//js-na2.hsforms.net/forms/embed/v2.js';
      script.onload = injectForm;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.hbspt) {
          clearInterval(interval);
          injectForm();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [theme]);

  return (
    <div className="expert-help-page">
      <div className="expert-help-content">
        <p className="expert-help-tagline">Want a second set of eyes on it?</p>
        <p className="expert-help-body-text">
          Shinro gets you most of the way on most queries. When it doesn't — or when you'd
          just like to talk something through with someone who's debugged a few hundred of
          these — the{' '}
          <a
            href="https://quest1.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="expert-help-link"
          >
            Quest1
          </a>{' '}
          engineering team is around.
        </p>
        <p className="expert-help-body-text">
          Share the query, the trace, and what you're trying to do. We'll write back.
        </p>
      </div>

      <div className="expert-help-divider" />

      <div className="expert-help-form-section">
        <h3 className="expert-help-form-title">Let's Talk</h3>
        <div className="expert-help-form-container">
          <div id="expert-help-hs-form" />
        </div>
      </div>
    </div>
  );
}
