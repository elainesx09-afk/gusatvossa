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
    // Loga no console pra você copiar fácil
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

// DEBUG: Mostra status de inicialização
function DebugScreen() {
  const [debug, setDebug] = React.useState({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? "✅ VITE_SUPABASE_URL" : "❌ VITE_SUPABASE_URL",
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? "✅ VITE_SUPABASE_ANON_KEY" : "❌ VITE_SUPABASE_ANON_KEY",
    apiBase: import.meta.env.VITE_API_BASE_URL ? "✅ VITE_API_BASE_URL" : "⚠️ VITE_API_BASE_URL",
    workspaceId: import.meta.env.VITE_WORKSPACE_ID ? "✅ VITE_WORKSPACE_ID" : "⚠️ VITE_WORKSPACE_ID",
  });

  const allGood = debug.supabaseUrl.includes("✅") && debug.supabaseKey.includes("✅");

  return (
    <div style={{
      padding: 24,
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "#0a0a0a",
      color: "#fff",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}>
      <h1 style={{ marginBottom: 24, fontSize: 28 }}>🔧 Status da Inicialização</h1>
      
      <div style={{ background: "#1a1a1a", padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: "#aaa" }}>Variáveis de Ambiente:</h2>
        {Object.entries(debug).map(([key, value]) => (
          <div key={key} style={{ padding: 8, borderBottom: "1px solid #333" }}>
            <code style={{ fontSize: 12 }}>{value}</code>
          </div>
        ))}
      </div>

      {!allGood && (
        <div style={{ background: "#3d2d2d", padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#ff9999" }}>⚠️ Problemas Encontrados:</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.8 }}>
            {!debug.supabaseUrl.includes("✅") && <li>VITE_SUPABASE_URL não está configurada na Vercel</li>}
            {!debug.supabaseKey.includes("✅") && <li>VITE_SUPABASE_ANON_KEY não está configurada na Vercel</li>}
          </ul>
          <p style={{ fontSize: 12, marginTop: 12, color: "#ccc" }}>
            <strong>Fix:</strong> Vá em Settings → Environment Variables na Vercel e adicione essas variáveis.
          </p>
        </div>
      )}

      {allGood && (
        <div style={{ background: "#2d3d2d", padding: 16, borderRadius: 8 }}>
          <p style={{ color: "#99ff99", fontSize: 14 }}>✅ Variáveis OK! Tentando carregar a app...</p>
        </div>
      )}
    </div>
  );
}

// Mostra debug por 3 segundos, depois tenta renderizar a app
let showDebug = true;
setTimeout(() => {
  showDebug = false;
  // Force re-render
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
}, 3000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DebugScreen />
    </ErrorBoundary>
  </React.StrictMode>
);
