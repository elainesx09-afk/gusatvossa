import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

type LeadRow = {
  id: string;
  workspace_id: string;
  name?: string | null;
  phone?: string | null;
  stage?: string | null;
  source?: string | null;
  score?: number | null;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadsApiResponse = {
  ok: boolean;
  debugId?: string;
  table?: string;
  column?: string;
  leads?: LeadRow[];
  error?: string;
  details?: any;
};

const stageLabel: Record<string, string> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  "follow-up": "Follow-up",
  ganhou: "Ganhou",
  perdido: "Perdido",
};

const stageBadgeClass: Record<string, string> = {
  novo: "border border-border",
  qualificando: "border border-border",
  proposta: "border border-border",
  "follow-up": "border border-border",
  ganhou: "border border-border",
  perdido: "border border-border",
};

async function fetchLeads(): Promise<LeadsApiResponse> {
  const base = (import.meta as any).env?.VITE_API_BASE_URL;
  const token = (import.meta as any).env?.VITE_API_TOKEN;
  const workspaceId = (import.meta as any).env?.VITE_WORKSPACE_ID;

  if (!base || !token || !workspaceId) {
    throw new Error(
      "Env faltando. Confira VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID."
    );
  }

  const url = `${base.replace(/\/$/, "")}/api/leads?workspace_id=${encodeURIComponent(workspaceId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-token": token,
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // se vier HTML/erro
    throw new Error(`Resposta inválida da API (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || json?.ok === false) {
    const msg = json?.error || json?.details?.message || `Falha ao buscar (${res.status})`;
    throw new Error(msg);
  }

  return json as LeadsApiResponse;
}

export default function Leads() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const leads = data?.leads ?? [];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const name = (l.name ?? "").toLowerCase();
      const phone = (l.phone ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [leads, searchQuery]);

  const columns = [
    {
      key: "name",
      header: "Lead",
      render: (item: LeadRow) => (
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">{item.name || "-"}</div>
          <div className="text-xs text-muted-foreground">{item.phone || "-"}</div>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      render: (item: LeadRow) => {
        const st = (item.stage ?? "novo").toString();
        return (
          <Badge variant="outline" className={cn("text-xs", stageBadgeClass[st] || "border border-border")}>
            {stageLabel[st] || st}
          </Badge>
        );
      },
    },
    {
      key: "source",
      header: "Source",
      render: (item: LeadRow) => <span className="text-sm text-muted-foreground">{item.source || "-"}</span>,
    },
    {
      key: "score",
      header: "Score",
      render: (item: LeadRow) => <span className="text-sm text-muted-foreground">{item.score ?? "-"}</span>,
    },
    {
      key: "updated_at",
      header: "Updated",
      render: (item: LeadRow) => (
        <span className="text-sm text-muted-foreground">
          {item.updated_at ? new Date(item.updated_at).toLocaleString() : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} leads</p>
        </div>
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          className="pl-10 bg-secondary border-border"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Carregando leads...
        </div>
      )}

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

      {!isLoading && !isError && <DataTable columns={columns as any} data={filtered as any} keyField="id" />}
    </div>
  );
}
