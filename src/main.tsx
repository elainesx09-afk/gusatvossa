import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { supabase } from "@/lib/supabaseClient";

const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;
const DEFAULT_WS = import.meta.env.VITE_WORKSPACE_ID as string | undefined;
const LS_KEY = "oneeleven_workspace_id";

function getWorkspaceId() {
  return localStorage.getItem(LS_KEY) || DEFAULT_WS || "";
}

function shouldInject(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return url.startsWith("/api/");
  }
}

async function buildInjectedHeaders() {
  const headers: Record<string, string> = {};

  if (API_TOKEN) headers["x-api-token"] = API_TOKEN;

  const ws = getWorkspaceId();
  if (ws) headers["x-workspace-id"] = ws;

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return headers;
}

// Patch global fetch once
const w = window as any;
if (!w.__ONEELEVEN_FETCH_PATCHED__) {
  w.__ONEELEVEN_FETCH_PATCHED__ = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (!shouldInject(url)) return originalFetch(input as any, init);

    const injected = await buildInjectedHeaders();
    const merged = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));

    for (const [k, v] of Object.entries(injected)) merged.set(k, v);

    // se tem body e não tem content-type, assume JSON
    if (init?.body && !merged.has("Content-Type")) merged.set("Content-Type", "application/json");

    return originalFetch(input as any, { ...init, headers: merged });
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
