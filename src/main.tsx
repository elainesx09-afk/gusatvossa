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
    this.state = { hasError: false, error: undefined };
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
            Abra o Console (F12) e procure por <b>APP_CRASH</b>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById("root");
if (!el) throw new Error('Missing <div id="root"></div> in index.html');

// IMPORTANT: create the React root ONCE (creating twice breaks React in production)
ReactDOM.createRoot(el).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
