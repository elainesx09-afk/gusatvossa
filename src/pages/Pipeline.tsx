import { useEffect, useState } from "react";
import { Plus, Clock, Star, MessageSquare, Calendar } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PipelineStage = "novo" | "qualificando" | "proposta" | "follow-up" | "ganhou" | "perdido";

const stages: { id: PipelineStage; label: string; color: string }[] = [
  { id: "novo", label: "Novo", color: "bg-info" },
  { id: "qualificando", label: "Qualificando", color: "bg-purple-500" },
  { id: "proposta", label: "Proposta", color: "bg-warning" },
  { id: "follow-up", label: "Follow-up", color: "bg-orange-500" },
  { id: "ganhou", label: "Ganhou", color: "bg-success" },
  { id: "perdido", label: "Perdido", color: "bg-destructive" },
];

type LeadApi = {
  id: string;
  workspace_id: string;
  name?: string | null;
  phone?: string | null;
  stage?: string | null;
  source?: string | null;
  score?: number | null;
  last_message?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function env(name: string) {
  return String((import.meta as any).env?.[name] || "");
}
const BASE = () => env("VITE_API_BASE_URL").replace(/\/$/, "");
const TOKEN = () => env("VITE_API_TOKEN");
const WORKSPACE = () => env("VITE_WORKSPACE_ID");

function headers() {
  return { "x-api-token": TOKEN() };
}
function headersJson() {
  return { ...headers(), "Content-Type": "application/json" };
}

function initials(name?: string | null) {
  const s = String(name || "Lead").trim();
  return (
    s
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "L"
  );
}

function safeStage(v?: string | null): PipelineStage {
  const s = String(v || "novo");
  return (stages.some((x) => x.id === s) ? s : "novo") as PipelineStage;
}

async function fetchLeads(): Promise<LeadApi[]> {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();

  if (!base || !token || !workspaceId) {
    throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");
  }

  const r = await fetch(`${base}/api/leads?workspace_id=${encodeURIComponent(workspaceId)}`, {
    headers: headers(),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j.leads ?? [];
}

async function patchLeadStage(input: { id: string; stage: PipelineStage }) {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();

  if (!base || !token || !workspaceId) {
    throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");
  }

  const body = { workspace_id: workspaceId, id: input.id, stage: input.stage };

  const r = await fetch(`${base}/api/leads`, {
    method: "PATCH",
    headers: headersJson(),
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j;
}

export default function Pipeline() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedLead, setSelectedLead] = useState<LeadApi | null>(null);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);

  const leadsQ = useQuery({
    queryKey: ["leads", WORKSPACE()],
    queryFn: fetchLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const serverLeads = leadsQ.data ?? [];

  const [localLeads, setLocalLeads] = useState<LeadApi[]>([]);
  useEffect(() => {
    setLocalLeads(serverLeads);
  }, [serverLeads]);

  const updateStageMut = useMutation({
    mutationFn: patchLeadStage,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["leads", WORKSPACE()] });
    },
    onError: async () => {
      await qc.invalidateQueries({ queryKey: ["leads", WORKSPACE()] });
    },
  });

  const getLeadsByStage = (stage: PipelineStage) => localLeads.filter((l) => safeStage(l.stage) === stage);

  const handleDragStart = (leadId: string) => setDraggedLead(leadId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (stage: PipelineStage) => {
    if (!draggedLead) return;

    const leadId = draggedLead;
    setDraggedLead(null);

    setLocalLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)));

    await updateStageMut.mutateAsync({ id: leadId, stage });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Arraste os leads entre as etapas</p>
        </div>
      </div>

      {leadsQ.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Erro carregando pipeline: {String((leadsQ.error as any)?.message || leadsQ.error)}
        </div>
      )}

      {updateStageMut.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Falha ao atualizar stage: {String((updateStageMut.error as any)?.message || updateStageMut.error)}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = getLeadsByStage(stage.id);

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
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onClick={() => setSelectedLead(lead)}
                      className={cn("kanban-card", draggedLead === lead.id && "opacity-50")}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary">{initials(lead.name)}</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm text-foreground">{lead.name || "Lead"}</h4>
                            <p className="text-xs text-muted-foreground">{lead.phone || "-"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className={cn("w-3 h-3", (lead.score ?? 0) >= 80 ? "text-warning fill-warning" : "text-muted-foreground")} />
                          <span className="text-xs font-medium text-foreground">{lead.score ?? 0}</span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{lead.last_message || "-"}</p>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {lead.last_message_at ? new Date(lead.last_message_at).toLocaleString() : "-"}
                        </div>
                      </div>
                    </div>
                  ))}
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
                <span className="text-sm font-semibold text-primary">{initials(selectedLead?.name)}</span>
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
                  <p className="text-xs text-muted-foreground mb-1">Source</p>
                  <p className="text-sm font-medium text-foreground">{selectedLead.source || "-"}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Score</p>
                  <p className="text-sm font-medium text-foreground">{selectedLead.score ?? 0}/100</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Stage</p>
                  <p className="text-sm font-medium text-foreground">{safeStage(selectedLead.stage)}</p>
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2">Follow-up History</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-foreground">D+0 - Initial contact</span>
                    <Badge variant="secondary" className="text-[10px]">Sent</Badge>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 btn-premium"
                  onClick={() => {
                    // navega SEM depender do Inbox estar “pronto”
                    navigate(`/inbox?lead_id=${encodeURIComponent(selectedLead.id)}`);
                  }}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Open Chat
                </Button>

                <Button variant="outline" className="flex-1 border-border text-muted-foreground">
                  Edit Lead
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
