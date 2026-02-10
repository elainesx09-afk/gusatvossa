import { useMemo } from "react";
import { MessageSquare, Users, Smartphone, TrendingUp, Target, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";

type LeadApi = {
  id: string;
  workspace_id: string;
  name?: string | null;
  phone?: string | null;
  stage?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type InstanceApi = {
  id: string;
  workspace_id: string;
  instance_name: string;
  status?: string | null;
  mode?: string | null;
  last_seen_at?: string | null;
  updated_at?: string | null;
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

async function getLeads(): Promise<LeadApi[]> {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  const r = await fetch(`${base}/api/leads?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: headers() });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j.leads ?? [];
}

async function getInstances(): Promise<InstanceApi[]> {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  const r = await fetch(`${base}/api/instances?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: headers() });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j.instances ?? [];
}

function stageKey(v?: string | null) {
  return String(v || "novo").toLowerCase().trim();
}

function isWon(stage: string) {
  return ["ganhou", "fechado", "closed", "won"].includes(stage);
}
function isLost(stage: string) {
  return ["perdido", "lost"].includes(stage);
}

export default function Overview() {
  const leadsQ = useQuery({
    queryKey: ["leads", WORKSPACE()],
    queryFn: getLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const instQ = useQuery({
    queryKey: ["instances", WORKSPACE()],
    queryFn: getInstances,
    staleTime: 10_000,
    retry: 1,
  });

  const leads = leadsQ.data ?? [];
  const instances = instQ.data ?? [];

  const metrics = useMemo(() => {
    const stages = new Map<string, number>();
    for (const l of leads) {
      const k = stageKey(l.stage);
      stages.set(k, (stages.get(k) || 0) + 1);
    }

    const total = leads.length;
    const won = Array.from(stages.entries()).reduce((acc, [k, v]) => acc + (isWon(k) ? v : 0), 0);
    const lost = Array.from(stages.entries()).reduce((acc, [k, v]) => acc + (isLost(k) ? v : 0), 0);
    const active = total - won - lost;

    const connected = instances.filter((i) => {
      const s = String(i.status || "").toLowerCase();
      const mode = String(i.mode || "").toLowerCase();
      if (mode === "demo" || s === "demo") return false;
      return ["connected", "open", "ready", "online"].includes(s);
    }).length;

    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : "0.0";

    // “Atividade hoje”: leads criados por hora (derivado de created_at)
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();

    const byHour = new Array(24).fill(0);
    for (const l of leads) {
      if (!l.created_at) continue;
      const dt = new Date(l.created_at);
      if (Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) {
        byHour[dt.getHours()]++;
      }
    }

    const hourlyData = byHour
      .map((count, hour) => ({ hour: String(hour).padStart(2, "0") + "h", leads: count }))
      .filter((x) => true);

    // Recent leads
    const recent = leads
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      })
      .slice(0, 6);

    return { total, active, won, lost, connected, conversionRate, hourlyData, recent, stages };
  }, [leads, instances]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Overview</h1>
        <p className="text-muted-foreground mt-1">Dados reais do seu workspace</p>

        {(leadsQ.isError || instQ.isError) && (
          <div className="text-xs text-destructive mt-2">
            {leadsQ.isError && <>Leads erro: {String((leadsQ.error as any)?.message || leadsQ.error)}<br/></>}
            {instQ.isError && <>Instances erro: {String((instQ.error as any)?.message || instQ.error)}</>}
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi title="Leads" value={metrics.total} icon={Users} hint="Total no CRM" />
        <Kpi title="Ativos" value={metrics.active} icon={Activity} hint="Não ganhos/perdidos" />
        <Kpi title="Ganhos" value={metrics.won} icon={Target} hint={`Conversão ${metrics.conversionRate}%`} />
        <Kpi title="Instâncias" value={instances.length} icon={Smartphone} hint={`${metrics.connected} conectadas`} />
        <Kpi title="Mensagens" value={"—"} icon={MessageSquare} hint="Em breve (stats)" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card border-border animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Leads criados hoje (por hora)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.hourlyData}>
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Por estágio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from(metrics.stages.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-semibold">{v}</span>
                </div>
              ))}
            {leadsQ.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
            {!leadsQ.isLoading && metrics.total === 0 && <div className="text-sm text-muted-foreground">Sem leads ainda.</div>}
          </CardContent>
        </Card>
      </div>

      {/* Recent */}
      <Card className="bg-card border-border animate-fade-in">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Leads recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {metrics.recent.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{l.name || "Lead"}</div>
                <div className="text-xs text-muted-foreground truncate">{l.last_message || "-"}</div>
              </div>
              <div className="text-xs text-muted-foreground ml-3 whitespace-nowrap">{stageKey(l.stage)}</div>
            </div>
          ))}
          {!leadsQ.isLoading && metrics.recent.length === 0 && <div className="text-sm text-muted-foreground">Sem leads para mostrar.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: any;
  icon: any;
  hint: string;
}) {
  return (
    <Card className="bg-card border-border animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          <span>{title}</span>
          <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{String(value)}</div>
        <div className={cn("text-xs mt-1", "text-muted-foreground")}>{hint}</div>
      </CardContent>
    </Card>
  );
}
