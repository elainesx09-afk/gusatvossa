import { useMemo, useState } from "react";
import { Search, MoreHorizontal, Phone, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type LeadStage = "novo" | "qualificando" | "proposta" | "follow-up" | "ganhou" | "perdido";

type LeadApi = {
  id: string;
  workspace_id: string;

  // opcionais (dependem do teu schema real)
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  stage?: LeadStage | null;
  source?: string | null;
  score?: number | null;
  last_message?: string | null;
  last_message_at?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

const stageColors: Record<LeadStage, string> = {
  novo: "bg-info/10 text-info border-info/30",
  qualificando: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  proposta: "bg-warning/10 text-warning border-warning/30",
  "follow-up": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  ganhou: "bg-success/10 text-success border-success/30",
  perdido: "bg-destructive/10 text-destructive border-destructive/30",
};

const stageLabels: Record<LeadStage, string> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta: "Proposta",
  "follow-up": "Follow-up",
  ganhou: "Ganhou",
  perdido: "Perdido",
};

function envOrThrow(name: string) {
  const v = (import.meta as any).env?.[name];
  return String(v || "");
}

async function apiGetLeads(): Promise<LeadApi[]> {
  const baseUrl = envOrThrow("VITE_API_BASE_URL");
  const token = envOrThrow("VITE_API_TOKEN");
  const workspaceId = envOrThrow("VITE_WORKSPACE_ID");

  if (!baseUrl || !token || !workspaceId) {
    throw new Error("Missing VITE envs (VITE_API_BASE_URL / VITE_API_TOKEN / VITE_WORKSPACE_ID)");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/leads?workspace_id=${encodeURIComponent(workspaceId)}`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-token": token,
    },
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    const msg = json?.error || json?.details?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  // teu endpoint retorna { ok:true, leads:[...] }
  if (!json?.ok) {
    throw new Error(json?.error || "API returned ok=false");
  }

  return (json.leads ?? []) as LeadApi[];
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function Leads() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["leads", envOrThrow("VITE_WORKSPACE_ID")],
    queryFn: apiGetLeads,
    staleTime: 15_000,
    retry: 1,
  });

  const allLeads = data ?? [];

  const normalized = useMemo(() => {
    // garante campos mínimos pra UI não quebrar
    return allLeads.map((l) => {
      const name = (l.name && String(l.name).trim()) || "Lead";
      const phone = (l.phone && String(l.phone).trim()) || "-";
      const stage: LeadStage = (l.stage as LeadStage) || "novo";
      const score = typeof l.score === "number" ? l.score : 0;
      const source = (l.source && String(l.source)) || "-";
      const lastMessage = (l.last_message && String(l.last_message)) || "-";
      const lastMessageAt = l.last_message_at || l.updated_at || l.created_at || null;

      return {
        ...l,
        name,
        phone,
        stage,
        score,
        source,
        lastMessage,
        lastMessageAt,
      };
    });
  }, [allLeads]);

  const filteredLeads = useMemo(() => {
    return normalized.filter((lead) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        String(lead.phone).includes(searchQuery.trim());
      const matchesStage = stageFilter === "all" || lead.stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [normalized, searchQuery, stageFilter]);

  const toggleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) setSelectedLeads([]);
    else setSelectedLeads(filteredLeads.map((l) => l.id));
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const columns = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
          onCheckedChange={toggleSelectAll}
        />
      ) as any,
      className: "w-12",
      render: (item: any) => (
        <Checkbox checked={selectedLeads.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
      ),
    },
    {
      key: "name",
      header: "Lead",
      render: (item: any) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">{initials(item.name)}</span>
          </div>
          <div>
            <div className="font-medium text-foreground">{item.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              {item.phone}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      render: (item: any) => (
        <Badge variant="outline" className={cn("border", stageColors[item.stage])}>
          {stageLabels[item.stage]}
        </Badge>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (item: any) => <span className="text-muted-foreground text-sm">{item.source}</span>,
    },
    {
      key: "score",
      header: "Score",
      render: (item: any) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                item.score >= 80 ? "bg-success" : item.score >= 50 ? "bg-warning" : "bg-destructive"
              )}
              style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }}
            />
          </div>
          <span className="text-sm font-medium text-foreground">{item.score}</span>
        </div>
      ),
    },
    {
      key: "lastMessage",
      header: "Last Message",
      render: (item: any) => (
        <div className="max-w-[220px]">
          <p className="text-sm text-foreground truncate">{item.lastMessage}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {fmtDateTime(item.lastMessageAt)}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Start Follow-up</DropdownMenuItem>
            <DropdownMenuItem>Move to Pipeline</DropdownMenuItem>
            <DropdownMenuItem>Assign to</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Carregando..." : `${filteredLeads.length} leads encontrados`}
            {dataUpdatedAt ? ` · atualizado: ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
          </p>
        </div>

        <Button variant="outline" className="border-border" onClick={() => refetch()}>
          Atualizar
        </Button>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">Erro carregando leads</div>
          <div className="mt-1 opacity-90">{String((error as any)?.message || error)}</div>
          <div className="mt-2 text-xs opacity-80">
            Confere se a Vercel tem: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-10 bg-secondary border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px] bg-secondary border-border">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="novo">Novo</SelectItem>
            <SelectItem value="qualificando">Qualificando</SelectItem>
            <SelectItem value="proposta">Proposta</SelectItem>
            <SelectItem value="follow-up">Follow-up</SelectItem>
            <SelectItem value="ganhou">Ganhou</SelectItem>
            <SelectItem value="perdido">Perdido</SelectItem>
          </SelectContent>
        </Select>

        {selectedLeads.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selectedLeads.length} selected</span>
            <Button variant="outline" size="sm" className="border-border text-muted-foreground">
              Start Follow-up
            </Button>
            <Button variant="outline" size="sm" className="border-border text-muted-foreground">
              Move Stage
            </Button>
            <Button variant="outline" size="sm" className="border-border text-muted-foreground">
              Assign
            </Button>
          </div>
        )}
      </div>

      <DataTable columns={columns as any} data={filteredLeads as any} keyField="id" />
    </div>
  );
}
