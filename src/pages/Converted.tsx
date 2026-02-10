import { useMemo } from 'react';
import { Trophy, TrendingUp, DollarSign, MessageSquare, Calendar, ArrowUpRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type ApiLead = {
  id: string;
  name: string | null;
  stage: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ConversionRecord = {
  id: string;
  leadId: string;
  leadName: string;
  conversionDate: string;
  sequenceUsed: string;
  messagesUntilConversion: number;
  estimatedValue: number;
};

function API_BASE() {
  return (import.meta as any).env?.VITE_API_BASE_URL || '';
}
function API_TOKEN() {
  return (import.meta as any).env?.VITE_API_TOKEN || '';
}
function WORKSPACE_ID() {
  return (import.meta as any).env?.VITE_WORKSPACE_ID || '';
}
function apiHeaders() {
  const h: Record<string, string> = {};
  const t = API_TOKEN();
  const w = WORKSPACE_ID();
  if (t) h['x-api-token'] = t;
  if (w) h['workspace_id'] = w;
  return h;
}
async function apiGet<T>(path: string): Promise<T> {
  const base = API_BASE();
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: apiHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `request_failed:${path}`);
  }
  return json as T;
}
function isConversionStage(stageRaw: string | null | undefined) {
  const s = (stageRaw || '').toLowerCase().trim();
  return ['ganhou', 'fechado', 'convertido', 'won', 'closed_won'].includes(s);
}
function toPtBRDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export default function Converted() {
  const workspaceId = WORKSPACE_ID();

  const leadsQuery = useQuery({
    queryKey: ['leads', workspaceId],
    enabled: !!API_BASE() && !!API_TOKEN() && !!workspaceId,
    queryFn: async () => {
      const q = `?workspace_id=${encodeURIComponent(workspaceId)}`;
      const j = await apiGet<{ ok: true; leads: ApiLead[] }>(`/api/leads${q}`);
      return j.leads || [];
    },
    staleTime: 15_000,
  });

  const conversions: ConversionRecord[] = useMemo(() => {
    const leads = leadsQuery.data || [];
    const conv = leads
      .filter((l) => isConversionStage(l.stage))
      .map((l) => ({
        id: `conv-${l.id}`,
        leadId: l.id,
        leadName: l.name || 'Lead',
        conversionDate: (l.updated_at || l.created_at || new Date().toISOString()) as string,
        sequenceUsed: '—',
        messagesUntilConversion: 0,
        estimatedValue: 0,
      }));

    return conv;
  }, [leadsQuery.data]);

  const totalRevenue = conversions.reduce((acc, c) => acc + c.estimatedValue, 0);
  const avgTicket = conversions.length > 0 ? totalRevenue / conversions.length : 0;
  const saasMonthly = 0;
  const roi = totalRevenue - saasMonthly;

  const chartData = useMemo(() => {
    // últimas 4 semanas (simples)
    const weeks = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];
    const buckets = weeks.map((w) => ({ week: w, conversions: 0, value: 0 }));

    const convDates = conversions
      .map((c) => c.conversionDate)
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .sort((a, b) => a - b);

    if (!convDates.length) return buckets;

    // distribui por quartis só pra não “inventar” — é apenas agrupamento visual
    const min = convDates[0];
    const max = convDates[convDates.length - 1];
    const span = Math.max(1, max - min);

    conversions.forEach((c) => {
      const t = new Date(c.conversionDate).getTime();
      const p = (t - min) / span;
      const idx = Math.min(3, Math.max(0, Math.floor(p * 4)));
      buckets[idx].conversions += 1;
      buckets[idx].value += c.estimatedValue;
    });

    return buckets;
  }, [conversions]);

  const columns = [
    {
      key: 'leadName',
      header: 'Lead',
      render: (item: ConversionRecord) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-success" />
          </div>
          <span className="font-medium text-foreground">{item.leadName}</span>
        </div>
      ),
    },
    {
      key: 'conversionDate',
      header: 'Conversion Date',
      render: (item: ConversionRecord) => (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          {toPtBRDate(item.conversionDate)}
        </div>
      ),
    },
    {
      key: 'sequenceUsed',
      header: 'Sequence Used',
      render: (item: ConversionRecord) => (
        <Badge variant="outline" className="border-primary/30 text-primary">
          {item.sequenceUsed}
        </Badge>
      ),
    },
    {
      key: 'messagesUntilConversion',
      header: 'Messages',
      render: (item: ConversionRecord) => (
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{item.messagesUntilConversion}</span>
        </div>
      ),
    },
    {
      key: 'estimatedValue',
      header: 'Value',
      render: (item: ConversionRecord) => (
        <span className="font-semibold text-success">R$ {item.estimatedValue.toLocaleString('pt-BR')}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Converted</h1>
        <p className="text-muted-foreground mt-1">Leads converted through follow-up sequences</p>
      </div>

      <Card className="bg-gradient-to-br from-warning/20 via-warning/10 to-card border-warning/30 glow-gold overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-warning/5 via-transparent to-warning/5 animate-pulse" style={{ animationDuration: '3s' }} />
        <CardContent className="pt-6 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-warning/80 font-medium mb-1 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
                Conversões por Follow-up
              </p>
              <p className="text-5xl font-bold font-display text-warning">{conversions.length}</p>
              <p className="text-sm text-muted-foreground mt-2">Leads que converteram após receberem sequências automáticas</p>
            </div>
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-warning/30 to-warning/10 flex items-center justify-center shadow-lg shadow-warning/20">
              <Trophy className="w-12 h-12 text-warning drop-shadow-lg" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold font-display text-foreground">R$ {totalRevenue.toLocaleString('pt-BR')}</p>
              </div>
              <DollarSign className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Ticket</p>
                <p className="text-2xl font-bold font-display text-foreground">
                  R$ {avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-info" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Messages</p>
                <p className="text-2xl font-bold font-display text-foreground">
                  {conversions.length > 0
                    ? Math.round(conversions.reduce((acc, c) => acc + c.messagesUntilConversion, 0) / conversions.length)
                    : 0}
                </p>
              </div>
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/20 to-card border-warning/30 glow-gold">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-warning/80 font-medium">ROI</p>
                <p className="text-2xl font-bold font-display text-warning">R$ {roi.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-muted-foreground mt-1">Revenue - SaaS (R$ {saasMonthly})</p>
              </div>
              <ArrowUpRight className="w-8 h-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Conversões por Semana
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="conversions" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">All Conversions</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={conversions} keyField="id" />
        </CardContent>
      </Card>
    </div>
  );
}
