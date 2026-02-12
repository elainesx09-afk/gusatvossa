import { useMemo, useState } from "react";
import { Plus, Smartphone, Wifi, WifiOff, QrCode, RefreshCw, Activity, Copy, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type WaInstanceApi = {
  id?: string;
  workspace_id?: string;
  instance_name: string;
  status?: string | null;
  mode?: string | null;
  webhook_url?: string | null;
  last_qr?: any;
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
function headersJson() {
  return { ...headers(), "Content-Type": "application/json" };
}

async function getInstances(): Promise<WaInstanceApi[]> {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  // Se você ainda não tem /api/instances, isso vai falhar e a UI mostra vazio (sem quebrar)
  const r = await fetch(`${base}/api/instances?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: headers() });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j.instances ?? [];
}

async function onboardInstance(instanceName: string) {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  const r = await fetch(`${base}/api/instances/onboard?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify({ instanceName }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j as { ok: true; instanceName: string; webhookUrl: string; mode?: string };
}

export default function Instances() {
  const qc = useQueryClient();

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const instancesQ = useQuery({
    queryKey: ["wa_instances", WORKSPACE()],
    queryFn: getInstances,
    staleTime: 10_000,
    retry: 1,
  });

  const onboardMut = useMutation({
    mutationFn: onboardInstance,
    onSuccess: async (j) => {
      setCreatedWebhookUrl(j.webhookUrl);
      await qc.invalidateQueries({ queryKey: ["wa_instances", WORKSPACE()] });
    },
  });

  const instances = instancesQ.data ?? [];

  const resetDialog = () => {
    setInstanceName("");
    setCreatedWebhookUrl(null);
    setCopied(false);
    setIsConnectDialogOpen(false);
  };

  const copyWebhook = async () => {
    if (!createdWebhookUrl) return;
    await navigator.clipboard.writeText(createdWebhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const connect = async () => {
    const name = instanceName.trim();
    if (!name) return;
    await onboardMut.mutateAsync(name);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Instances</h1>
          <p className="text-muted-foreground mt-1">Manage your WhatsApp connections</p>
        </div>

        <Dialog open={isConnectDialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); else setIsConnectDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="btn-premium">
              <Plus className="w-4 h-4 mr-2" />
              Connect WhatsApp
            </Button>
          </DialogTrigger>

          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Connect WhatsApp</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                This will create your instance and prepare automatic inbound events.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Instance Name</Label>
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="e.g., botzap-principal"
                  className="bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Use lowercase + hyphen. Example: <span className="font-mono">botzap-principal</span>
                </p>
              </div>

              {createdWebhookUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-secondary/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Webhook URL (auto)</div>
                        <div className="font-mono text-xs text-foreground truncate">{createdWebhookUrl}</div>
                      </div>
                      <Button variant="outline" size="icon" className="border-border" onClick={copyWebhook} title="Copy">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <QrCode className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm font-medium text-foreground">WhatsApp activation</div>
                      <Badge variant="outline" className="border-border text-muted-foreground ml-auto">Aguardando ativação</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Assim que o WhatsApp real estiver ativo, o QR Code aparecerá aqui automaticamente.
                    </p>
                    <div className="mt-3 w-48 h-48 mx-auto bg-secondary rounded-xl flex items-center justify-center border border-border">
                      <QrCode className="w-24 h-24 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                    <div className="text-sm text-foreground">Prepare instance</div>
                    <Badge className="ml-auto" variant="secondary">Auto</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    One Eleven will prepare inbound events automatically. No manual setup.
                  </p>
                </div>
              )}

              {onboardMut.isError && (
                <div className="text-xs text-destructive">
                  Falha ao conectar: {String((onboardMut.error as any)?.message || onboardMut.error)}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={resetDialog} className="text-muted-foreground">
                Close
              </Button>
              {!createdWebhookUrl ? (
                <Button className="btn-premium" onClick={connect} disabled={onboardMut.isPending || !instanceName.trim()}>
                  {onboardMut.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Creating...
                    </span>
                  ) : (
                    "Create Instance"
                  )}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {instancesQ.isError && (
        <div className="text-xs text-destructive">
          Não consegui listar instâncias ainda (endpoint /api/instances). Tudo bem — conectar via botão funciona.
          <div className="opacity-80 mt-1">Erro: {String((instancesQ.error as any)?.message || instancesQ.error)}</div>
        </div>
      )}

      {/* Instances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(instances.length ? instances : []).map((inst) => (
          <InstanceCard key={`${inst.instance_name}`} inst={inst} />
        ))}

        {instances.length === 0 && !instancesQ.isError && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">No instances yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Click <span className="font-medium text-foreground">Connect WhatsApp</span> to create your first instance.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InstanceCard({ inst }: { inst: WaInstanceApi }) {
  const status = String(inst.status || "awaiting_activation");
  const isConnected = status === "connected";

  return (
    <Card className={cn("bg-card border-border transition-all duration-300", isConnected && "glow-success")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", isConnected ? "bg-success/10" : "bg-secondary")}>
              {isConnected ? <Wifi className="w-6 h-6 text-success" /> : <WifiOff className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">{inst.instance_name}</CardTitle>
              <p className="text-sm text-muted-foreground">{isConnected ? "Connected" : "WhatsApp aguardando ativação"}</p>
            </div>
          </div>

          <Badge variant={isConnected ? "secondary" : "outline"} className="border-border text-muted-foreground">
            {isConnected ? "connected" : "pending"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs">Events</span>
            </div>
            <p className="text-xl font-bold text-foreground">—</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Smartphone className="w-4 h-4" />
              <span className="text-xs">Messages</span>
            </div>
            <p className="text-xl font-bold text-foreground">—</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last update</span>
          <span className="font-medium text-muted-foreground">
            {inst.updated_at ? new Date(inst.updated_at).toLocaleString() : "—"}
          </span>
        </div>

        <div className="flex gap-2">
          {isConnected ? (
            <>
              <Button variant="outline" size="sm" className="flex-1 text-muted-foreground border-border">
                Disconnect
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-muted-foreground border-border">
                Restart
              </Button>
            </>
          ) : (
            <Button className="flex-1 btn-premium">
              <QrCode className="w-4 h-4 mr-2" />
              View QR (soon)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
