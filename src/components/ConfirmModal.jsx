import React from 'react';

export default function ConfirmModal({ open, title, children, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false }) {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px) saturate(120%)',
      }} onClick={onCancel} />

      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={{
        position: 'relative',
        maxWidth: 700,
        width: '90%',
        background: '#1b0f2e',
        borderRadius: 10,
        padding: 20,
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        color: '#fff'
      }}>
        <h3 id="confirm-title" style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>
        <div style={{ marginBottom: 18, lineHeight: 1.4 }}>{children}</div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {onConfirm ? (
            <>
              <button onClick={onCancel} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff' }}>{cancelLabel}</button>
              <button onClick={onConfirm} style={{ padding: '8px 14px', background: destructive ? '#e11d48' : '#6b21a8', border: 'none', borderRadius: 6, color: '#fff' }}>{confirmLabel}</button>
            </>
          ) : (
            <button onClick={onCancel} style={{ padding: '8px 14px', background: '#6b21a8', border: 'none', borderRadius: 6, color: '#fff' }}>{cancelLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
