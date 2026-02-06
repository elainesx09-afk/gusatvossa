{isError && (
  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
    <div className="font-semibold">Erro carregando leads</div>
    <div className="mt-1 opacity-90">{String((error as any)?.message || error)}</div>

    <div className="mt-3 text-xs text-destructive/90">
      <div>VITE_API_BASE_URL: {(import.meta as any).env?.VITE_API_BASE_URL ? "OK" : "MISSING"}</div>
      <div>VITE_WORKSPACE_ID: {(import.meta as any).env?.VITE_WORKSPACE_ID ? "OK" : "MISSING"}</div>
      <div>VITE_API_TOKEN: {(import.meta as any).env?.VITE_API_TOKEN ? "OK" : "MISSING"}</div>
    </div>
  </div>
)}
