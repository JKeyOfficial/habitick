import { useState } from 'react';
import { getTodayStr, parseDateLocal } from '../utils/helpers.js';

export function GoalsTab({ goals = [], onAdd, onEdit, onToggle, onDelete }) {
  const today = getTodayStr();

  const activeGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);

  const getDaysRemainingLabel = (targetDateStr) => {
    if (!targetDateStr) return null;
    
    const targetDate = parseDateLocal(targetDateStr);
    const currentDate = parseDateLocal(today);
    
    // Calculate difference in time
    const diffTime = targetDate - currentDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { text: "Overdue", isOverdue: true };
    } else if (diffDays === 0) {
      return { text: "Ends today", isToday: true };
    } else if (diffDays === 1) {
      return { text: "1 day left", isClose: true };
    } else {
      return { text: `${diffDays} days left`, isFuture: true };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = parseDateLocal(dateStr);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "10px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "28px", margin: 0, color: "#fff", letterSpacing: "-0.02em" }}>
            Goals
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Focus on your big, long-term milestones
          </p>
        </div>
        <button
          onClick={onAdd}
          style={{
            padding: "10px 20px",
            borderRadius: "12px",
            border: "none",
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
            fontFamily: "inherit",
            boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            transition: "transform 0.15s ease",
          }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
        >
          + Add Goal
        </button>
      </div>

      {/* Active Goals Section */}
      <div style={{ marginBottom: "32px", animation: "fadeUp 0.3s ease-out" }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: "#9ca3af", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Active Goals ({activeGoals.length})
        </h2>

        {activeGoals.length === 0 ? (
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: "#4b5563" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🏅</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af" }}>No active goals</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Set a long-term goal to track your biggest achievements!</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {activeGoals.map(g => {
              const status = getDaysRemainingLabel(g.target_date);
              return (
                <div
                  key={g.id}
                  style={{
                    background: "rgba(22, 31, 48, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: "16px",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    transition: "all 0.2s ease"
                  }}
                >
                  {/* Circular Checkbox */}
                  <div
                    onClick={() => onToggle(g.id)}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: "2px solid rgba(255, 255, 255, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      flexShrink: 0
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#3b82f6"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)"}
                  />

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "#f9fafb", lineHeight: 1.3 }}>
                      {g.title}
                    </div>
                    {g.description && (
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.description}
                      </div>
                    )}
                    {g.target_date && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                        <span style={{ fontSize: "10.5px", color: "#6b7280", fontWeight: 500 }}>
                          Target: {formatDate(g.target_date)}
                        </span>
                        {status && (
                          <span style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: status.isOverdue ? "rgba(239, 68, 68, 0.08)" : (status.isToday || status.isClose ? "rgba(245, 158, 11, 0.08)" : "rgba(59, 130, 246, 0.08)"),
                            color: status.isOverdue ? "#ef4444" : (status.isToday || status.isClose ? "#f59e0b" : "#60a5fa"),
                            border: `1px solid ${status.isOverdue ? "rgba(239, 68, 68, 0.15)" : (status.isToday || status.isClose ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)")}`
                          }}>
                            {status.text}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button
                      onClick={() => onEdit(g)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#9ca3af",
                        padding: "6px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center"
                      }}
                      title="Edit Goal"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete the goal "${g.title}"?`)) onDelete(g.id); }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#6b7280",
                        padding: "6px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center"
                      }}
                      title="Delete Goal"
                      onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                      onMouseLeave={e => e.currentTarget.style.color = "#6b7280"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Goals Section */}
      <div style={{ animation: "fadeUp 0.4s ease-out" }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: "#6b7280", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Completed Goals ({completedGoals.length})
        </h2>

        {completedGoals.length === 0 ? (
          <div style={{ border: "1px dashed rgba(255,255,255,0.03)", borderRadius: "16px", padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
            Completed goals will be listed here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {completedGoals.map(g => (
              <div
                key={g.id}
                style={{
                  background: "rgba(22, 31, 48, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.02)",
                  borderRadius: "16px",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  opacity: 0.6
                }}
              >
                {/* Completed Checkbox */}
                <div
                  onClick={() => onToggle(g.id)}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: "2px solid #3b82f6",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "#9ca3af", textDecoration: "line-through", lineHeight: 1.3 }}>
                    {g.title}
                  </div>
                  {g.description && (
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", lineHeight: 1.4, textDecoration: "line-through" }}>
                      {g.description}
                    </div>
                  )}
                  {g.completed_at && (
                    <div style={{ fontSize: "10px", color: "#4b5563", fontWeight: 500, marginTop: "6px" }}>
                      Completed on {new Date(g.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => { if (confirm(`Delete the goal "${g.title}"?`)) onDelete(g.id); }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#4b5563",
                      padding: "6px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center"
                    }}
                    title="Delete Goal"
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#4b5563"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
