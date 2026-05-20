import { useEffect, useRef, useState } from 'react';
import type { AppNotification, NotificationType } from '../context/NotificationContext';
import { useNotifications } from '../context/NotificationContext';
import './NotificationToast.css';

const MAX_VISIBLE = 4;
const COLLAPSED_PREVIEW = 5;

function typeLabel(type: NotificationType): string {
  if (type === 'error') return 'Error';
  if (type === 'warning') return 'Warning';
  return 'Info';
}

function TypeIcon({ type }: { type: NotificationType }) {
  if (type === 'error') {
    return (
      <svg className="notif-type-icon notif-type-icon--error" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="10" r="0.7" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg className="notif-type-icon notif-type-icon--warning" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="10" r="0.7" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="notif-type-icon notif-type-icon--info" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="4" r="0.7" fill="currentColor" />
      <path d="M7 6.5v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function NotificationCard({ notification, onDismiss }: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => onDismiss(notification.id), 280);
  };

  useEffect(() => {
    if (!notification.autoDismissMs) return;
    timerRef.current = setTimeout(dismiss, notification.autoDismissMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const visibleMessages = expanded
    ? notification.messages
    : notification.messages.slice(0, COLLAPSED_PREVIEW);
  const hiddenCount = notification.messages.length - COLLAPSED_PREVIEW;

  return (
    <div className={`notif-card notif-card--${notification.type} ${exiting ? 'notif-card--exiting' : ''}`}>
      {notification.autoDismissMs && !exiting && (
        <div
          className={`notif-progress notif-progress--${notification.type}`}
          style={{ animationDuration: `${notification.autoDismissMs}ms` }}
        />
      )}
      <div className="notif-header">
        <div className="notif-header-left">
          <TypeIcon type={notification.type} />
          <span className="notif-section">{notification.section}</span>
          <span className={`notif-badge notif-badge--${notification.type}`}>
            {typeLabel(notification.type)}
          </span>
        </div>
        <button className="notif-dismiss" onClick={dismiss} title="Dismiss">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <ul className="notif-messages">
        {visibleMessages.map((msg, i) => (
          <li key={i} className="notif-message">{msg}</li>
        ))}
      </ul>
      {hiddenCount > 0 && !expanded && (
        <button className="notif-show-more" onClick={() => setExpanded(true)}>
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}

export default function NotificationToastContainer() {
  const { notifications, dismissNotification, clearAll } = useNotifications();

  if (notifications.length === 0) return null;

  const visible = notifications.slice(0, MAX_VISIBLE);
  const overflow = notifications.length - MAX_VISIBLE;

  return (
    <div className="notif-container">
      {visible.map((n) => (
        <NotificationCard key={n.id} notification={n} onDismiss={dismissNotification} />
      ))}
      {overflow > 0 && (
        <button className="notif-overflow-pill" onClick={clearAll}>
          +{overflow} more — dismiss all
        </button>
      )}
    </div>
  );
}
