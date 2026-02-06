import React, { createContext, useContext, useMemo, useState, ReactNode } from "react";

type Workspace = {
  id: string;
  name: string;
};

interface WorkspaceContextType {
  currentWorkspace: Workspace;
  setCurrentWorkspace: (workspace: Workspace) => void;
  workspaces: Workspace[];
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID as string | undefined;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspaces = useMemo<Workspace[]>(() => {
    // MVP: 1 workspace fixo “DEMO”
    const id = WORKSPACE_ID || "";
    return [{ id, name: "DEMO" }];
  }, []);

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(workspaces[0]);

  return (
    <WorkspaceContext.Provider value={{ currentWorkspace, setCurrentWorkspace, workspaces }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}
