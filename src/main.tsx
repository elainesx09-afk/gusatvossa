// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("APP_CRASH:", error);
    console.error("APP_CRASH_INFO:", info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          <h1 style={{ fontSize: 16, marginBottom: 8 }}>App crashou (JS)</h1>
          <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {String(this.state.error?.message || this.state.error || "unknown_error")}
          </pre>
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Abra o Console (F12) e copie a linha <b>APP_CRASH</b>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DebugScreen() {
  const debug = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? "✅ VITE_SUPABASE_URL" : "❌ VITE_SUPABASE_URL",
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? "✅ VITE_SUPABASE_ANON_KEY" : "❌ VITE_SUPABASE_ANON_KEY",
    apiBase: import.meta.env.VITE_API_BASE_URL ? "✅ VITE_API_BASE_URL" : "⚠️ VITE_API_BASE_URL",
    workspaceId: import.meta.env.VITE_WORKSPACE_ID ? "✅ VITE_WORKSPACE_ID" : "⚠️ VITE_WORKSPACE_ID",
  };
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif", background: "#0a0a0a", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <h1 style={{ marginBottom: 24, fontSize: 28 }}>🔧 Status da Inicialização</h1>
      <div style={{ background: "#1a1a1a", padding: 16, borderRadius: 8 }}>
        {Object.entries(debug).map(([k, v]) => (
          <div key={k} style={{ padding: 8, borderBottom: "1px solid #333" }}>
            <code style={{ fontSize: 12 }}>{v}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("missing_root_container");

// ✅ UMA root só (evita crash silencioso em prod)
const root = ReactDOM.createRoot(container);

// Debug por 1.5s e depois troca pra App
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <DebugScreen />
    </ErrorBoundary>
  </React.StrictMode>
);

setTimeout(() => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}, 1500);
