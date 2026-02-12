// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Crash overlay:
 * - Mostra erros de runtime (React crash / unhandled rejection) na TELA
 * - Não depende de F12
 * - Não altera o visual normal do app (só aparece se der erro)
 */

function ensureOverlayContainer() {
  let el = document.getElementById("__oneeleven_crash_overlay__");
  if (!el) {
    el = document.createElement("div");
    el.id = "__oneeleven_crash_overlay__";
    document.body.appendChild(el);
  }
  return el;
}

function renderOverlay(title: string, message: string, stack?: string) {
  const el = ensureOverlayContainer();
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.zIndex = "999999";
  el.style.background = "rgba(0,0,0,0.92)";
  el.style.color = "#fff";
  el.style.padding = "16px";
  el.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  el.style.overflow = "auto";

  el.innerHTML = `
    <div style="max-width: 960px; margin: 0 auto; padding: 8px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <h1 style="font-size:16px; margin:0; letter-spacing:0.2px;">${escapeHtml(
          title
        )}</h1>
        <button id="__oneeleven_crash_close__"
          style="background:#222;border:1px solid #444;color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer;">
          Fechar
        </button>
      </div>

      <p style="margin:10px 0 14px; font-size:12px; opacity:0.85;">
        Copie o bloco abaixo e me mande aqui. Isso é o motivo do branco na Vercel.
      </p>

      <div style="background:#111;border:1px solid #333;border-radius:12px;padding:12px;">
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">Mensagem</div>
        <pre style="white-space:pre-wrap; margin:0; font-size:12px; line-height:1.45;">${escapeHtml(
          message || "(sem mensagem)"
        )}</pre>
      </div>

      ${
        stack
          ? `
      <div style="margin-top:12px; background:#111;border:1px solid #333;border-radius:12px;padding:12px;">
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">Stack</div>
        <pre style="white-space:pre-wrap; margin:0; font-size:12px; line-height:1.45;">${escapeHtml(
          stack
        )}</pre>
      </div>
      `
          : ""
      }

      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        <button id="__oneeleven_crash_copy__"
          style="background:#0b5;border:0;color:#000;padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:700;">
          Copiar tudo
        </button>
        <span style="font-size:11px; opacity:0.7;">
          ONE ELEVEN Crash Overlay • (não altera UI normal)
        </span>
      </div>
    </div>
  `;

  const closeBtn = document.getElementById("__oneeleven_crash_close__");
  closeBtn?.addEventListener("click", () => {
    el?.remove();
  });

  const copyBtn = document.getElementById("__oneeleven_crash_copy__");
  copyBtn?.addEventListener("click", async () => {
    const payload = [
      `TITLE: ${title}`,
      `MESSAGE: ${message || ""}`,
      stack ? `STACK:\n${stack}` : "",
      `URL: ${location.href}`,
      `UA: ${navigator.userAgent}`,
      `TIME: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(payload);
      (copyBtn as HTMLButtonElement).textContent = "Copiado ✅";
      setTimeout(() => {
        (copyBtn as HTMLButtonElement).textContent = "Copiar tudo";
      }, 1500);
    } catch {
      // fallback: seleciona texto
      alert("Não deu pra copiar automático. Selecione e copie manualmente.");
    }
  });
}

function escapeHtml(str: string) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
    const msg = String(error?.message || error || "unknown_error");
    const stack = String(error?.stack || "");
    console.error("APP_CRASH:", error);
    console.error("APP_CRASH_INFO:", info);
    renderOverlay("App crashou (React ErrorBoundary)", msg, stack);
  }

  render() {
    if (this.state.hasError) {
      // A UI fica em branco normalmente; aqui a gente deixa uma tela mínima,
      // mas o overlay já mostra o erro.
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0a0a0a",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          }}
        >
          <div style={{ maxWidth: 640, textAlign: "center" }}>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              O app crashou. O erro está no overlay.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Captura erros fora do React (muito comum quando fica tela branca)
window.addEventListener("error", (ev) => {
  const msg =
    (ev as any)?.message ||
    String((ev as any)?.error?.message || "window_error");
  const stack = String((ev as any)?.error?.stack || "");
  renderOverlay("Erro JS (window.error)", msg, stack);
});

window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
  const reason = (ev as any)?.reason;
  const msg = String(reason?.message || reason || "unhandled_rejection");
  const stack = String(reason?.stack || "");
  renderOverlay("Promise rejeitada (unhandledrejection)", msg, stack);
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  renderOverlay("Erro fatal", 'Não encontrei <div id="root"></div> no index.html');
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
