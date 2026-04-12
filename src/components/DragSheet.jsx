import { useState } from 'react';

export function DragSheet({ onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(null);
  const [dragging, setDragging] = useState(false);

  const onTouchStart = e => { setStartY(e.touches[0].clientY); setDragging(true); };
  const onTouchMove = e => {
    if (!dragging || startY === null) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) setDragY(delta);
  };
  const onTouchEnd = () => {
    if (dragY > 120) { onClose(); }
    setDragY(0); setStartY(null); setDragging(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#06080cd0", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "24px", padding: "24px", width: "100%", maxWidth: "500px", maxHeight: "94vh", overflowY: dragY > 10 ? "hidden" : "auto", transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 0.3s ease", boxSizing: "border-box", willChange: "transform", touchAction: "pan-x", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        {/* Drag handle */}
        <div style={{ width: "48px", height: "5px", background: "#374151", borderRadius: "999px", margin: "0 auto 20px", cursor: "grab" }} />
        {children}
      </div>
    </div>
  );
}