import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[HabiTick ErrorBoundary caught an error]:", error, errorInfo);
    // If it's a dynamic chunk load failure (e.g. following a deployment or stale cache), auto-reload once
    if (error?.message && (
      error.message.includes("dynamically imported module") || 
      error.message.includes("Loading chunk") ||
      error.message.includes("Failed to fetch")
    )) {
      const reloaded = sessionStorage.getItem("ht_chunk_reload");
      if (!reloaded) {
        sessionStorage.setItem("ht_chunk_reload", "1");
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          background: "#080b11",
          color: "#f3f4f6",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          fontFamily: "'DM Sans', system-ui, sans-serif"
        }}>
          <img src="/habitick-blue-logo.png" alt="HabiTick" style={{ width: "56px", height: "56px", marginBottom: "16px" }} />
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", maxWidth: "380px", margin: "0 0 24px", lineHeight: 1.5 }}>
            We encountered an unexpected error while loading this view.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem("ht_chunk_reload");
              window.location.reload();
            }}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)"
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
