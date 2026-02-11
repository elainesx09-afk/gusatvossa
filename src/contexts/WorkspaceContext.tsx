import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

type Workspace = { id: string; name: string };

interface WorkspaceContextType {
  loading: boolean;
  currentWorkspace: Workspace;
  setCurrentWorkspace: (workspace: Workspace) => void;
  workspaces: Workspace[];
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const LS_KEY = "oneeleven_workspace_id";

function safePickInitial(): Workspace {
  const saved = localStorage.getItem(LS_KEY) || "";
  return { id: saved, name: "Workspace" };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const initial = safePickInitial();
    return initial.id ? [initial] : [];
  });

  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace>(() => {
    const initial = safePickInitial();
    return initial;
  });

  const setCurrentWorkspace = (ws: Workspace) => {
    setCurrentWorkspaceState(ws);
    localStorage.setItem(LS_KEY, ws.id);
  };

  const refresh = async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceState(safePickInitial());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/workspaces", { method: "GET" });
      const j = await r.json();

      if (!j?.ok) {
        // fallback: não quebra a UI
        setLoading(false);
        return;
      }

      const list: Workspace[] = (j.workspaces ?? []).map((w: any) => ({
        id: String(w.id),
        name: String(w.name ?? "Workspace"),
      }));

      setWorkspaces(list);

      const savedId = localStorage.getItem(LS_KEY);
      const pick = list.find((w) => w.id === savedId) || list[0];

      if (pick) setCurrentWorkspace(pick);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  const value = useMemo<WorkspaceContextType>(() => {
    return {
      loading,
      currentWorkspace,
      setCurrentWorkspace,
      workspaces,
      refresh,
    };
  }, [loading, currentWorkspace, workspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}
