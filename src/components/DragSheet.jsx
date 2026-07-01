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
        background: "rgba(6, 8, 12, 0.85)", 
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
          background: "#0d1117", 
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
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