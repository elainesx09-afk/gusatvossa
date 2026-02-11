// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

type EBState = { hasError: boolean; error?: any };

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
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
        <div
          style={{
            padding: 16,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            background: "#0a0a0a",
            color: "#fff",
            minHeight: "100vh",
          }}
        >
          <h1 style={{ fontSize: 16, marginBottom: 8 }}>App crashou (JS)</h1>
          <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {String(this.state.error?.message || this.state.error || "unknown_error")}
          </pre>
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Se o F12 não abrir, me manda print dessa tela.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DebugScreen() {
  const debug = React.useMemo(
    () => ({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL
        ? "✅ VITE_SUPABASE_URL"
        : "❌ VITE_SUPABASE_URL",
      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY
        ? "✅ VITE_SUPABASE_ANON_KEY"
        : "❌ VITE_SUPABASE_ANON_KEY",
      apiBase: import.meta.env.VITE_API_BASE_URL
        ? "✅ VITE_API_BASE_URL"
        : "⚠️ VITE_API_BASE_URL",
      workspaceId: import.meta.env.VITE_WORKSPACE_ID
        ? "✅ VITE_WORKSPACE_ID"
        : "⚠️ VITE_WORKSPACE_ID",
    }),
    []
  );

  const allGood = debug.supabaseUrl.includes("✅") && debug.supabaseKey.includes("✅");

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#0a0a0a",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <h1 style={{ marginBottom: 24, fontSize: 28 }}>🔧 Status da Inicialização</h1>

      <div style={{ background: "#1a1a1a", padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: "#aaa" }}>
          Variáveis de Ambiente:
        </h2>

        {Object.entries(debug).map(([key, value]) => (
          <div key={key} style={{ padding: 8, borderBottom: "1px solid #333" }}>
            <code style={{ fontSize: 12 }}>{value}</code>
          </div>
        ))}
      </div>

      {!allGood && (
        <div style={{ background: "#3d2d2d", padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#ff9999" }}>
            ⚠️ Problemas Encontrados:
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.8 }}>
            {!debug.supabaseUrl.includes("✅") && (
              <li>VITE_SUPABASE_URL não está configurada na Vercel</li>
            )}
            {!debug.supabaseKey.includes("✅") && (
              <li>VITE_SUPABASE_ANON_KEY não está configurada na Vercel</li>
            )}
          </ul>
          <p style={{ fontSize: 12, marginTop: 12, color: "#ccc" }}>
            <strong>Fix:</strong> Vercel → Settings → Environment Variables.
          </p>
        </div>
      )}

      {allGood && (
        <div style={{ background: "#2d3d2d", padding: 16, borderRadius: 8 }}>
          <p style={{ color: "#99ff99", fontSize: 14 }}>
            ✅ Variáveis OK! Carregando a app...
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Bootstrap sem quebrar o root:
 * - criaRoot UMA vez
 * - alterna DebugScreen -> App via state
 */
function Bootstrap() {
  const [mode, setMode] = React.useState<"debug" | "app">("debug");

  React.useEffect(() => {
    const t = setTimeout(() => setMode("app"), 1200);
    return () => clearTimeout(t);
  }, []);

  // captura erros globais que ocorram fora do React
  React.useEffect(() => {
    const onError = (event: any) => {
      console.error("WINDOW_ERROR:", event?.error || event);
    };
    const onRejection = (event: any) => {
      console.error("UNHANDLED_REJECTION:", event?.reason || event);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return mode === "debug" ? <DebugScreen /> : <App />;
}

const el = document.getElementById("root");
if (!el) {
  // se isso acontecer, teu index.html está errado
  document.body.innerHTML = `<pre style="padding:16px">FATAL: #root not found in index.html</pre>`;
} else {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Bootstrap />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
