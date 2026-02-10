import { useMemo } from "react";
import type { ElementType } from "react";
import {
  MessageSquare,
  Users,
  Smartphone,
  Trophy,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Calendar,
  Target,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard, MagicFormulaItem } from "@/components/ui/kpi-card";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

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

type WaInstanceApi = {
  id?: string;
  workspace_id?: string;
  instance_name: string;
  status?: string | null;
  mode?: string | null;
  webhook_url?: string | null;
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

function parseDate(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtShortDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(from: Date, to = new Date()) {
  const diff = to.getTime() - from.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

function normStage(s?: string | null) {
  return String(s || "novo").trim().toLowerCase();
}
const STAGE_WON = new Set(["fechado", "ganhou", "won", "closed_won"]);
const STAGE_LOST = new Set(["perdido", "lost", "closed_lost"]);
function isClosed(stage?: string | null) {
  const x = normStage(stage);
  return STAGE_WON.has(x) || STAGE_LOST.has(x);
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

async function getInstances(): Promise<WaInstanceApi[]> {
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

// Micro sparkline component
function Sparkline({ data, color = "primary" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((value, i) => (
        <div
          key={i}
          className={cn("w-1 rounded-full transition-all duration-300", color === "primary" ? "bg-primary/60" : "bg-warning/60")}
          style={{
            height: `${((value - min) / range) * 100}%`,
            minHeight: "4px",
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ActivityItem({
  icon: Icon,
  title,
  time,
  type,
}: {
  icon: ElementType;
  title: string;
  time: string;
  type: "success" | "info" | "warning";
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-all duration-200 group">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110",
          type === "success" && "bg-success/10 text-success",
          type === "info" && "bg-primary/10 text-primary",
          type === "warning" && "bg-warning/10 text-warning"
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}

function QuickStat({ label, value, trend, trendUp }: { label: string; value: string | number; trend: string; trendUp: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-all duration-200 group">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{value}</span>
        <span className={cn("flex items-center text-xs font-medium", trendUp ? "text-success" : "text-destructive")}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend}
        </span>
      </div>
    </div>
  );
}

export default function Overview() {
  const { currentWorkspace } = useWorkspace();

  const leadsQ = useQuery({
    queryKey: ["leads", WORKSPACE()],
    queryFn: getLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const instancesQ = useQuery({
    queryKey: ["wa_instances", WORKSPACE()],
    queryFn: getInstances,
    staleTime: 10_000,
    retry: 1,
  });

  const leads = leadsQ.data ?? [];
  const instances = instancesQ.data ?? [];

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  const last7Start = new Date(todayStart);
  last7Start.setDate(todayStart.getDate() - 6);

  const metrics = useMemo(() => {
    const totalLeads = leads.length;

    const wins = leads.filter((l) => STAGE_WON.has(normStage(l.stage))).length;
    const lost = leads.filter((l) => STAGE_LOST.has(normStage(l.stage))).length;
    const conversionRate = totalLeads > 0 ? ((wins / totalLeads) * 100).toFixed(1) : "0.0";

    const leadsToday = leads.filter((l) => {
      const d = parseDate(l.created_at);
      return d && d >= todayStart;
    }).length;

    const leadsYesterday = leads.filter((l) => {
      const d = parseDate(l.created_at);
      return d && d >= yesterdayStart && d < todayStart;
    }).length;

    const connectedInstances = instances.filter((i) => String(i.status || "").toLowerCase() === "connected").length;

    const last24h = new Date(now);
    last24h.setHours(now.getHours() - 24);

    const activeLeads = leads.filter((l) => {
      if (isClosed(l.stage)) return false;
      const last = parseDate(l.last_message_at) || parseDate(l.updated_at) || parseDate(l.created_at);
      return last ? last >= last24h : false;
    }).length;

    const needsFollowUp = leads.filter((l) => {
      if (isClosed(l.stage)) return false;
      const last = parseDate(l.last_message_at) || parseDate(l.updated_at) || parseDate(l.created_at);
      return last ? last < last24h : true;
    }).length;

    // qualificados: qualquer coisa acima de "novo" e não fechado/perdido
    const qualifiedLeads = leads.filter((l) => {
      const s = normStage(l.stage);
      if (isClosed(s)) return false;
      return ["qualificado", "qualificando", "agendado", "proposta", "em_atendimento"].includes(s);
    }).length;

    return {
      totalLeads,
      wins,
      lost,
      conversionRate,
      leadsToday,
      leadsYesterday,
      connectedInstances,
      activeLeads,
      needsFollowUp,
      qualifiedLeads,
    };
  }, [leads, instances, now, todayStart, yesterdayStart]);

  const leadsVsConversions = useMemo(() => {
    const days: { day: string; leads: number; conversions: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d0 = new Date(last7Start);
      d0.setDate(last7Start.getDate() + i);
      d0.setHours(0, 0, 0, 0);

      const d1 = new Date(d0);
      d1.setDate(d0.getDate() + 1);

      const day = fmtShortDate(d0);
      const leadsCount = leads.filter((l) => {
        const c = parseDate(l.created_at);
        return c && c >= d0 && c < d1;
      }).length;

      const convCount = leads.filter((l) => {
        if (!STAGE_WON.has(normStage(l.stage))) return false;
        const u = parseDate(l.updated_at) || parseDate(l.last_message_at);
        return u && u >= d0 && u < d1;
      }).length;

      days.push({ day, leads: leadsCount, conversions: convCount });
    }
    return days;
  }, [leads, last7Start]);

  const hourlyData = useMemo(() => {
    // buckets fixos (08h..20h) pra ficar bonito e real
    const buckets = [8, 10, 12, 14, 16, 18, 20].map((h) => ({ hour: `${String(h).padStart(2, "0")}h`, messages: 0, _h: h }));
    for (const l of leads) {
      const d = parseDate(l.last_message_at) || parseDate(l.updated_at);
      if (!d) continue;
      if (d < todayStart) continue;
      const h = d.getHours();
      const b = buckets.find((x) => x._h === h || x._h === h - (h % 2)); // aproxima
      if (b) b.messages += 1; // “atividade” por lead ativo
    }
    return buckets.map(({ hour, messages }) => ({ hour, messages }));
  }, [leads, todayStart]);

  const recentLeads = useMemo(() => {
    return leads
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.last_message_at) || parseDate(a.updated_at) || parseDate(a.created_at) || new Date(0);
        const db = parseDate(b.last_message_at) || parseDate(b.updated_at) || parseDate(b.created_at) || new Date(0);
        return db.getTime() - da.getTime();
      })
      .slice(0, 5);
  }, [leads]);

  const sparkMsg = useMemo(() => leadsVsConversions.map((x) => x.leads), [leadsVsConversions]);
  const sparkLeads = useMemo(() => leadsVsConversions.map((x) => x.conversions), [leadsVsConversions]);

  const hasWhatsAppConnected = metrics.connectedInstances > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Overview</h1>
        <p className="text-muted-foreground mt-1">Bem-vindo ao painel de {currentWorkspace?.name || "sua empresa"}</p>
        {(leadsQ.isError || instancesQ.isError) && (
          <div className="mt-2 text-xs text-destructive">
            {leadsQ.isError ? `Erro leads: ${String((leadsQ.error as any)?.message || leadsQ.error)}` : null}
            {instancesQ.isError ? ` | Erro instances: ${String((instancesQ.error as any)?.message || instancesQ.error)}` : null}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            title: "Leads Totais",
            value: metrics.totalLeads,
            icon: Users,
            change: `${metrics.leadsToday} hoje`,
            changeType: "positive" as const,
            delay: 0,
          },
          {
            title: "Leads Ativos (24h)",
            value: metrics.activeLeads,
            icon: Activity,
            change: metrics.activeLeads > 0 ? "em atendimento" : "sem atividade",
            changeType: metrics.activeLeads > 0 ? ("positive" as const) : ("neutral" as const),
            delay: 50,
          },
          {
            title: "Taxa de Conversão",
            value: `${metrics.conversionRate}%`,
            icon: Target,
            change: `${metrics.wins} ganhos`,
            changeType: metrics.wins > 0 ? ("positive" as const) : ("neutral" as const),
            delay: 100,
          },
          {
            title: "Precisam Follow-up",
            value: metrics.needsFollowUp,
            icon: Clock,
            change: "últimas 24h",
            changeType: metrics.needsFollowUp > 0 ? ("warning" as const) : ("positive" as const),
            delay: 150,
            iconClassName: "bg-warning/10 group-hover:bg-warning/20",
          },
          {
            title: "WhatsApp Conectado",
            value: metrics.connectedInstances,
            icon: Smartphone,
            change: hasWhatsAppConnected ? "operacional" : "aguardando ativação",
            changeType: hasWhatsAppConnected ? ("positive" as const) : ("warning" as const),
            delay: 200,
          },
        ].map((kpi) => (
          <div key={kpi.title} className="animate-fade-in" style={{ animationDelay: `${kpi.delay}ms` }}>
            <KPICard {...kpi} />
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: "250ms" }}>
        <QuickStat
          label="Leads Hoje"
          value={metrics.leadsToday}
          trend={metrics.leadsToday >= metrics.leadsYesterday ? `+${Math.max(metrics.leadsToday - metrics.leadsYesterday, 0)}` : `-${metrics.leadsYesterday - metrics.leadsToday}`}
          trendUp={metrics.leadsToday >= metrics.leadsYesterday}
        />
        <QuickStat label="Qualificados" value={metrics.qualifiedLeads} trend="pipeline" trendUp={metrics.qualifiedLeads > 0} />
        <QuickStat label="Ganhos" value={metrics.wins} trend="conversões" trendUp={metrics.wins > 0} />
        <QuickStat label="Perdidos" value={metrics.lost} trend="perdas" trendUp={false} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads vs Conversions */}
        <Card className="lg:col-span-2 bg-card border-border animate-fade-in" style={{ animationDelay: "300ms" }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Leads vs Conversões (7d)
              </CardTitle>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Leads</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  <span className="text-muted-foreground">Conversões</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={leadsVsConversions}>
                  <defs>
                    <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="conversionsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" fill="url(#leadsGradient)" strokeWidth={2} name="Leads" />
                  <Area type="monotone" dataKey="conversions" stroke="hsl(var(--warning))" fill="url(#conversionsGradient)" strokeWidth={2} name="Conversões" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Magic Formula */}
        <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: "350ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-warning animate-pulse" />
              Magic Formula Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <MagicFormulaItem label="WhatsApp conectado" status={hasWhatsAppConnected ? "complete" : "warning"} />
            <MagicFormulaItem label="CRM operacional" status={metrics.totalLeads >= 0 ? "complete" : "warning"} />
            <MagicFormulaItem label="Inbound ativo" status={metrics.totalLeads > 0 ? "complete" : "warning"} />
            <MagicFormulaItem label="Conversões rastreadas" status={metrics.wins > 0 ? "complete" : "warning"} />

            <div className="pt-4 mt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status Geral</span>
                <span className={cn("font-semibold", hasWhatsAppConnected ? "text-primary" : "text-warning")}>
                  {hasWhatsAppConnected ? "Operacional" : "Aguardando WhatsApp"}
                </span>
              </div>
              <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-premium rounded-full transition-all duration-1000 ease-out"
                  style={{ width: hasWhatsAppConnected ? "100%" : "75%" }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Today */}
        <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: "400ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Atividade Hoje (por hora)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-warning" />
                <span className="text-sm text-muted-foreground">Atividade baseada em leads recentes</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{metrics.activeLeads} ativos</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity (real) */}
        <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: "450ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Atividade Recente (real)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentLeads.map((l) => {
              const name = l.name || l.phone || "Lead";
              const stage = normStage(l.stage);
              const t = parseDate(l.last_message_at) || parseDate(l.updated_at) || parseDate(l.created_at) || new Date();
              const closedWon = STAGE_WON.has(stage);
              const closedLost = STAGE_LOST.has(stage);

              const type: "success" | "info" | "warning" =
                closedWon ? "success" : closedLost ? "warning" : "info";

              const title = closedWon
                ? `${name} converteu!`
                : closedLost
                  ? `${name} perdido`
                  : `Atualização: ${name}`;

              return <ActivityItem key={l.id} icon={closedWon ? Trophy : MessageSquare} title={title} time={relativeTime(t)} type={type} />;
            })}
            {recentLeads.length === 0 && <div className="text-sm text-muted-foreground">Sem atividade ainda.</div>}
          </CardContent>
        </Card>

        {/* Performance (real) */}
        <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: "500ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Performance (7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Leads</span>
                <Sparkline data={sparkMsg} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Conversões</span>
                <Sparkline data={sparkLeads} color="warning" />
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Conversão atual</span>
                <span className="text-sm font-semibold text-foreground">{metrics.conversionRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-premium rounded-full transition-all duration-1000" style={{ width: `${Math.min(Number(metrics.conversionRate), 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                Ganhos: <span className="text-primary font-medium">{metrics.wins}</span> • Perdidos:{" "}
                <span className="text-muted-foreground font-medium">{metrics.lost}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent "Conversations" (real via leads last_message) */}
      <Card className="bg-card border-border animate-fade-in" style={{ animationDelay: "550ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Recent Conversations (real)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentLeads.map((l, index) => {
              const name = l.name || l.phone || "Lead";
              const last = l.last_message || "—";
              const t = parseDate(l.last_message_at) || parseDate(l.updated_at) || parseDate(l.created_at) || new Date();
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-all duration-200 group"
                  style={{ animationDelay: `${600 + index * 50}ms` }}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <span className="text-sm font-semibold text-primary">{String(name).split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors">{name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{last}</p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtTime(t)}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
            {recentLeads.length === 0 && <div className="text-sm text-muted-foreground">Sem conversas ainda.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
