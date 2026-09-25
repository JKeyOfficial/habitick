import { useEffect } from 'react';

export function DragSheet({ onClose, children }) {
  // Disable body scroll when modal is open to prevent double-scrolling
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div 
      style={{ 
        position: "fixed", 
        inset: 0, 
        background: "var(--ht-modal-overlay)", 
        backdropFilter: "blur(10px)",
        zIndex: 20000, 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "flex-end"
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ 
          background: "var(--ht-modal-bg)", 
          borderTop: "1px solid var(--ht-border-card)",
          borderRadius: "24px 24px 0 0", 
          padding: "24px 20px 48px 20px", 
          width: "100%", 
          maxWidth: "540px", 
          height: "90vh", 
          margin: "0 auto",
          boxSizing: "border-box",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch"
        }}
      >
        {children}
      </div>
    </div>
  );
}