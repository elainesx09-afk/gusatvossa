import { useMemo, useState } from "react";
import { Plus, Clock, Star, MessageSquare, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PipelineStage = "novo" | "qualificando" | "proposta" | "follow-up" | "ganhou" | "perdido";

const stages: { id: PipelineStage; label: string; color: string }[] = [
  { id: "novo", label: "Novo", color: "bg-info" },
  { id: "qualificando", label: "Qualificando", color: "bg-purple-500" },
  { id: "proposta", label: "Proposta", color: "bg-warning" },
  { id: "follow-up", label: "Follow-up", color: "bg-orange-500" },
  { id: "ganhou", label: "Ganhou", color: "bg-success" },
  { id: "perdido", label: "Perdido", color: "bg-destructive" },
];

type Lead = {
  id: string;
  workspace_id?: string;
  name?: string;
  phone?: string;
  stage?: PipelineStage;
  score?: number;
  last_message?: string;
  lastMessage?: string;
  last_message_at?: string;
  lastMessageAt?: string;
  needs_follow_up?: boolean;
  needsFollowUp?: boolean;
  tags?: string[];
};

function env(name: string) {
  // Vite env safe access
  return (import.meta as any).env?.[name] as string | undefined;
}

const API_BASE = env("VITE_API_BASE_URL") || "";
const API_TOKEN = env("VITE_API_TOKEN") || "";
const ENV_WORKSPACE_ID = env("VITE_WORKSPACE_ID") || "";

async function apiFetch(path: string, init?: RequestInit) {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL missing");
  if (!API_TOKEN) throw new Error("VITE_API_TOKEN missing");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "x-api-token": API_TOKEN,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      json?.error ||
      json?.message ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";
    throw new Error(msg);
  }

  return json;
}

export default function Pipeline() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || ENV_WORKSPACE_ID;

  const nav = useNavigate();
  const qc = useQueryClient();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leads", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspace_id missing (VITE_WORKSPACE_ID ou WorkspaceContext)");
      const r = await apiFetch(`/api/leads?workspace_id=${encodeURIComponent(workspaceId)}`);
      return (r?.leads ?? []) as Lead[];
    },
    enabled: Boolean(workspaceId),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const leads = data || [];

  const updateStage = useMutation({
    mutationFn: async (p: { id: string; stage: PipelineStage }) => {
      if (!workspaceId) throw new Error("workspace_id missing");
      return apiFetch(`/api/leads`, {
        method: "PATCH",
        body: JSON.stringify({ workspace_id: workspaceId, id: p.id, stage: p.stage }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", workspaceId] });
    },
  });

  const leadsByStage = useMemo(() => {
    const map = new Map<PipelineStage, Lead[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of leads) {
      const st = (l.stage || "novo") as PipelineStage;
      if (!map.has(st)) map.set(st, []);
      map.get(st)!.push(l);
    }
    return map;
  }, [leads]);

  const handleDragStart = (leadId: string) => setDraggedLeadId(leadId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (stage: PipelineStage) => {
    if (!draggedLeadId) return;

    // otimista (UI instantânea) → depois refetch
    const original = leads.find((x) => x.id === draggedLeadId);
    setDraggedLeadId(null);

    if (!original) return;
    if ((original.stage || "novo") === stage) return;

    try {
      await updateStage.mutateAsync({ id: draggedLeadId, stage });
    } catch {
      // se falhar, refetch já corrige
      qc.invalidateQueries({ queryKey: ["leads", workspaceId] });
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando pipeline…</div>;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-semibold">Erro ao carregar Pipeline</div>
        <div className="mt-1 opacity-90">{String((error as any)?.message || error)}</div>
        <div className="mt-3 text-xs text-destructive/90">
          <div>VITE_API_BASE_URL: {API_BASE ? "OK" : "MISSING"}</div>
          <div>VITE_WORKSPACE_ID: {workspaceId ? "OK" : "MISSING"}</div>
          <div>VITE_API_TOKEN: {API_TOKEN ? "OK" : "MISSING"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Arraste e solte. Salva no Supabase.</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = leadsByStage.get(stage.id) || [];

          return (
            <div
              key={stage.id}
              className="kanban-column flex-shrink-0"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", stage.color)} />
                  <h3 className="font-semibold text-foreground">{stage.label}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {stageLeads.length}
                  </Badge>
                </div>

                <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground" disabled>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="h-[500px]">
                <div className="space-y-3 pr-2">
                  {stageLeads.map((lead) => {
                    const name = lead.name || "Sem nome";
                    const phone = lead.phone || "-";
                    const score = Number(lead.score ?? 0);
                    const lastMsg = lead.last_message ?? lead.lastMessage ?? "";
                    const lastAt = lead.last_message_at ?? lead.lastMessageAt ?? "";
                    const tags = lead.tags ?? [];
                    const needsFU = Boolean(lead.needs_follow_up ?? lead.needsFollowUp);

                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => handleDragStart(lead.id)}
                        onClick={() => setSelectedLead(lead)}
                        className={cn("kanban-card", draggedLeadId === lead.id && "opacity-50")}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {name
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join("")}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm text-foreground">{name}</h4>
                              <p className="text-xs text-muted-foreground">{phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star
                              className={cn(
                                "w-3 h-3",
                                score >= 80 ? "text-warning fill-warning" : "text-muted-foreground"
                              )}
                            />
                            <span className="text-xs font-medium text-foreground">{score}</span>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{lastMsg}</p>

                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {lastAt}
                          </div>
                          {needsFU && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30"
                            >
                              Needs Follow-up
                            </Badge>
                          )}
                        </div>

                        {tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {(selectedLead?.name || "S")
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </span>
              </div>
              {selectedLead?.name || "Lead"}
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  <p className="text-sm font-medium text-foreground">{selectedLead.phone || "-"}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Stage</p>
                  <p className="text-sm font-medium text-foreground">{selectedLead.stage || "novo"}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Score</p>
                  <p className="text-sm font-medium text-foreground">{Number(selectedLead.score ?? 0)}/100</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Last Activity</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedLead.last_message_at ?? selectedLead.lastMessageAt ?? "-"}
                  </p>
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2">Follow-up (mock)</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-foreground">D+0 - Initial contact</span>
                    <Badge variant="secondary" className="text-[10px]">
                      Sent
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 btn-premium"
                  onClick={() => nav(`/inbox?lead_id=${encodeURIComponent(selectedLead.id)}`)}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Open Chat
                </Button>
                <Button variant="outline" className="flex-1 border-border text-muted-foreground" onClick={() => setSelectedLead(null)}>
                  Fechar
                </Button>
              </div>

              {updateStage.isPending && (
                <div className="text-xs text-muted-foreground">Salvando mudança de stage…</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
