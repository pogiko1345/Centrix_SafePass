import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { subscribeAlerts, getCurrentAlert, dismissAlert } from '../utils/Alert.web';

export default function WebAlertHost() {
  const alert = useSyncExternalStore(subscribeAlerts, getCurrentAlert, () => null);
  const dialog = useRef(null);
  useEffect(() => {
    if (!alert) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const buttons = () => [...dialog.current.querySelectorAll('button')];
    const cancel = alert.buttons.findIndex(button => button.style === 'cancel');
    (buttons()[cancel >= 0 ? cancel : 0])?.focus();
    const keydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (alert.options.cancelable !== false) dismissAlert(alert.id);
      }
      if (event.key === 'Tab') {
        const items = buttons();
        const index = items.indexOf(document.activeElement);
        event.preventDefault();
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [alert]);
  if (!alert || typeof document === 'undefined') return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgba(4,30,66,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={event => { if (event.target === event.currentTarget && alert.options.cancelable !== false) dismissAlert(alert.id); }}>
      <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`alert-title-${alert.id}`} aria-describedby={`alert-message-${alert.id}`}
        style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto', borderRadius: 16, background: '#fff', color: '#0F172A', padding: 24, boxShadow: '0 20px 60px #041e4240', fontFamily: 'system-ui, sans-serif' }}>
        <h2 id={`alert-title-${alert.id}`} style={{ fontSize: 21, margin: '0 0 12px' }}>{alert.title}</h2>
        <p id={`alert-message-${alert.id}`} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: '0 0 24px' }}>{alert.message}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}>
          {alert.buttons.map((button, index) => <button key={index} type="button" onClick={() => dismissAlert(alert.id, index)}
            style={{ minHeight: 44, padding: '10px 18px', borderRadius: 8, border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 600,
              background: button.style === 'cancel' ? '#F1F5F9' : button.style === 'destructive' ? '#B91C1C' : '#0A3D91', color: button.style === 'cancel' ? '#0F172A' : '#fff' }}>
            {button.text || 'OK'}
          </button>)}
        </div>
      </div>
    </div>, document.body,
  );
}
