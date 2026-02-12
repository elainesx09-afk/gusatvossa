import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

type CrashInfo = {
  name?: string;
  message: string;
  stack?: string;
};

type AppModule = {
  default: React.ComponentType;
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Root element "#root" was not found');
}

const root = ReactDOM.createRoot(rootElement);
let currentCrash: CrashInfo | null = null;
let AppComponent: React.ComponentType | null = null;

const envChecks = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_WORKSPACE_ID: import.meta.env.VITE_WORKSPACE_ID,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

function toCrashInfo(input: unknown): CrashInfo {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    };
  }

  return {
    message: typeof input === "string" ? input : JSON.stringify(input, null, 2),
  };
}

function reportCrash(reason: unknown) {
  currentCrash = toCrashInfo(reason);
  render();
}

window.onerror = (_message, _source, _lineno, _colno, error) => {
  reportCrash(error ?? _message ?? "Unknown window.onerror");
  return false;
};

window.onunhandledrejection = (event) => {
  reportCrash(event.reason ?? "Unhandled promise rejection without reason");
};

function CrashOverlay({ crash }: { crash: CrashInfo }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        color: "#f5f5f5",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        padding: "24px",
        overflow: "auto",
        zIndex: 99999,
      }}
    >
      <h1 style={{ margin: 0, fontSize: "20px", color: "#ff6b6b" }}>Application crash detected</h1>
      <p style={{ marginTop: "12px", whiteSpace: "pre-wrap" }}>
        {crash.name ? `${crash.name}: ` : ""}
        {crash.message}
      </p>
      {crash.stack ? (
        <pre style={{ marginTop: "12px", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{crash.stack}</pre>
      ) : null}

      <h2 style={{ marginTop: "20px", fontSize: "16px" }}>Environment checks</h2>
      <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
        {Object.entries(envChecks).map(([key, value]) => (
          <li key={key}>
            <strong>{key}</strong>: {value ? "OK" : "MISSING"}
            {value ? ` (${String(value)})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function render() {
  if (currentCrash) {
    root.render(<CrashOverlay crash={currentCrash} />);
    return;
  }

  if (!AppComponent) {
    return;
  }

  root.render(
    <React.StrictMode>
      <AppComponent />
    </React.StrictMode>
  );
}

async function bootstrap() {
  try {
    const appModule = (await import("./App")) as AppModule;
    AppComponent = appModule.default;
    render();
  } catch (error) {
    reportCrash(error);
  }
}

void bootstrap();
