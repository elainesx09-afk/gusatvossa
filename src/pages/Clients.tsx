import { useMemo, useState, useEffect } from 'react';
import { Plus, Building2, MoreHorizontal, Users, Smartphone, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Workspace = {
  id: string;
  name: string;
  niche: string;
  timezone: string;
  status: 'active' | 'inactive';
  instances: number;
  leads: number;
  conversions: number;
  lastActivity: string;
  createdAt: string;
};

type ApiLead = {
  id: string;
  stage: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type ApiInstance = {
  id: string;
  status?: string | null;
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

const STORAGE_KEY = 'oneeleven_clients_v1';

function seedDefaultClient(): Workspace[] {
  const w = WORKSPACE_ID() || 'default';
  const now = new Date().toISOString().slice(0, 10);
  return [
    {
      id: w,
      name: 'ONE ELEVEN',
      niche: 'WhatsApp + IA + CRM',
      timezone: 'America/Sao_Paulo',
      status: 'active',
      instances: 0,
      leads: 0,
      conversions: 0,
      lastActivity: 'agora',
      createdAt: now,
    },
  ];
}

export default function Clients() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [clients, setClients] = useState<Workspace[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Workspace[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {}
    }
    return seedDefaultClient();
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
    } catch {}
  }, [clients]);

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

  const instancesQuery = useQuery({
    queryKey: ['instances', workspaceId],
    enabled: !!API_BASE() && !!API_TOKEN() && !!workspaceId,
    queryFn: async () => {
      const q = `?workspace_id=${encodeURIComponent(workspaceId)}`;
      const j = await apiGet<{ ok: true; instances: ApiInstance[] }>(`/api/instances${q}`);
      return j.instances || [];
    },
    staleTime: 15_000,
  });

  const liveStats = useMemo(() => {
    const leads = leadsQuery.data || [];
    const instances = instancesQuery.data || [];
    const conversions = leads.filter((l) => isConversionStage(l.stage)).length;

    // última atividade: última atualização de lead (se tiver)
    const last = leads
      .map((l) => l.updated_at || l.created_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];

    return {
      leads: leads.length,
      instances: instances.length,
      conversions,
      lastActivity: last ? 'recente' : 'agora',
    };
  }, [leadsQuery.data, instancesQuery.data]);

  const hydratedClients = useMemo(() => {
    // Atualiza apenas o cliente principal (workspace atual) com números reais
    return clients.map((c) => {
      if (c.id !== workspaceId) return c;
      return {
        ...c,
        instances: liveStats.instances,
        leads: liveStats.leads,
        conversions: liveStats.conversions,
        lastActivity: liveStats.lastActivity,
      };
    });
  }, [clients, workspaceId, liveStats]);

  const columns = [
    {
      key: 'name',
      header: 'Client',
      render: (item: Workspace) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">{item.name}</div>
            <div className="text-xs text-muted-foreground">{item.niche}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Workspace) => (
        <StatusBadge status={item.status === 'active' ? 'connected' : 'disconnected'} label={item.status} />
      ),
    },
    {
      key: 'instances',
      header: 'Instances',
      render: (item: Workspace) => (
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{item.instances}</span>
        </div>
      ),
    },
    {
      key: 'leads',
      header: 'Leads',
      render: (item: Workspace) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{item.leads}</span>
        </div>
      ),
    },
    {
      key: 'conversions',
      header: 'Conversions',
      render: (item: Workspace) => (
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" />
          <span className="text-foreground font-medium">{item.conversions}</span>
        </div>
      ),
    },
    {
      key: 'lastActivity',
      header: 'Last Activity',
      render: (item: Workspace) => <span className="text-muted-foreground text-sm">{item.lastActivity}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: () => (
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  // Add Client (local only)
  const [newName, setNewName] = useState('');
  const [newNiche, setNewNiche] = useState('other');
  const [newTimezone, setNewTimezone] = useState('sao_paulo');

  const createClient = () => {
    const now = new Date().toISOString().slice(0, 10);
    const id = `local-${crypto.randomUUID()}`;
    const nicheLabel =
      newNiche === 'fashion'
        ? 'Moda & Vestuário'
        : newNiche === 'health'
        ? 'Saúde & Estética'
        : newNiche === 'tech'
        ? 'Tecnologia'
        : newNiche === 'food'
        ? 'Alimentação'
        : newNiche === 'services'
        ? 'Serviços'
        : 'Outro';

    const tz =
      newTimezone === 'sao_paulo'
        ? 'America/Sao_Paulo'
        : newTimezone === 'new_york'
        ? 'America/New_York'
        : 'Europe/London';

    setClients([
      ...clients,
      {
        id,
        name: newName || 'New Client',
        niche: nicheLabel,
        timezone: tz,
        status: 'active',
        instances: 0,
        leads: 0,
        conversions: 0,
        lastActivity: 'agora',
        createdAt: now,
      },
    ]);

    setIsDialogOpen(false);
    setNewName('');
    setNewNiche('other');
    setNewTimezone('sao_paulo');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your agency's client workspaces</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-premium">
              <Plus className="w-4 h-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>

          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Workspace</DialogTitle>
              <DialogDescription className="text-muted-foreground">Add a new client workspace to your agency</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">
                  Company Name
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Fashion Brand Co."
                  className="bg-secondary border-border"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="niche" className="text-foreground">
                  Niche / Industry
                </Label>
                <Select value={newNiche} onValueChange={setNewNiche}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="fashion">Moda & Vestuário</SelectItem>
                    <SelectItem value="health">Saúde & Estética</SelectItem>
                    <SelectItem value="tech">Tecnologia</SelectItem>
                    <SelectItem value="food">Alimentação</SelectItem>
                    <SelectItem value="services">Serviços</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-foreground">
                  Timezone
                </Label>
                <Select value={newTimezone} onValueChange={setNewTimezone}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="sao_paulo">America/Sao_Paulo (GMT-3)</SelectItem>
                    <SelectItem value="new_york">America/New_York (GMT-5)</SelectItem>
                    <SelectItem value="london">Europe/London (GMT+0)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground">
                  WhatsApp Number
                </Label>
                <Input id="phone" placeholder="+55 11 99999-9999" className="bg-secondary border-border" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-muted-foreground">
                Cancel
              </Button>
              <Button className="btn-premium" onClick={createClient}>
                Create Workspace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-3xl font-bold font-display text-foreground">{hydratedClients.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-3xl font-bold font-display text-foreground">
                  {hydratedClients.reduce((acc, c) => acc + c.leads, 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Conversions</p>
                <p className="text-3xl font-bold font-display text-foreground">
                  {hydratedClients.reduce((acc, c) => acc + c.conversions, 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={hydratedClients} keyField="id" />
    </div>
  );
}
