import { useMemo, useState } from "react";
import { Plus, Smartphone, Wifi, WifiOff, QrCode, RefreshCw, Activity } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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

type InstanceApi = {
  id: string;
  workspace_id: string;
  instance_name: string;
  status?: string | null;
  mode?: string | null;
  phone?: string | null;
  last_qrcode?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
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
  return { ...headers(), "Content-Type": "application/json", "workspace_id": WORKSPACE() };
}

function fmtLastPing(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins <= 0) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
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

async function onboardInstance(args: { instanceName: string; events: string[] }) {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  const r = await fetch(`${base}/api/instances/onboard`, {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify({
      instanceName: args.instanceName,
      events: args.events,
    }),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j;
}

function mapUiStatus(inst: InstanceApi): "connected" | "disconnected" | "connecting" {
  const s = String(inst.status || "").toLowerCase();
  const mode = String(inst.mode || "").toLowerCase();
  if (mode === "demo" || s === "demo") return "disconnected";
  if (s.includes("connect")) return "connecting";
  if (["connected", "open", "ready", "online"].includes(s)) return "connected";
  return "disconnected";
}

export default function Instances() {
  const qc = useQueryClient();

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  const [instanceName, setInstanceName] = useState("");
  const [events, setEvents] = useState<string[]>([
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
  ]);

  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [onboardMode, setOnboardMode] = useState<string | null>(null);

  const resetOnboarding = () => {
    setOnboardingStep(1);
    setIsConnectDialogOpen(false);
    setInstanceName("");
    setQrPayload(null);
    setOnboardMode(null);
    setEvents(["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"]);
  };

  const instancesQ = useQuery({
    queryKey: ["instances", WORKSPACE()],
    queryFn: getInstances,
    staleTime: 10_000,
    retry: 1,
  });

  const onboardMut = useMutation({
    mutationFn: onboardInstance,
    onSuccess: async (j: any) => {
      setOnboardMode(String(j?.mode || ""));
      setQrPayload(j?.qr ? String(j.qr) : null);
      await qc.invalidateQueries({ queryKey: ["instances", WORKSPACE()] });
      setOnboardingStep(2);
    },
  });

  const instances = instancesQ.data ?? [];

  const qrSrc = useMemo(() => {
    if (!qrPayload) return null;
    const v = qrPayload.trim();
    if (v.startsWith("data:image/")) return v;
    // se vier base64 “puro”
    if (v.length > 200 && /^[A-Za-z0-9+/=]+$/.test(v)) return `data:image/png;base64,${v}`;
    return null;
  }, [qrPayload]);

  const onNext = async () => {
    if (onboardingStep === 1) {
      const name = instanceName.trim();
      if (!name) return;
      await onboardMut.mutateAsync({ instanceName: name, events });
      return;
    }
    if (onboardingStep === 2) {
      setOnboardingStep(3);
      return;
    }
  };

  const toggleEvent = (ev: string) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Instances</h1>
          <p className="text-muted-foreground mt-1">Manage your WhatsApp connections</p>
          {instancesQ.isError && (
            <div className="text-xs text-destructive mt-2">
              Erro: {String((instancesQ.error as any)?.message || instancesQ.error)}
            </div>
          )}
        </div>

        <Dialog
          open={isConnectDialogOpen}
          onOpenChange={(open) => {
            if (!open) resetOnboarding();
            else setIsConnectDialogOpen(true);
          }}
        >
          <DialogTrigger asChild>
            <Button className="btn-premium">
              <Plus className="w-4 h-4 mr-2" />
              Connect Instance
            </Button>
          </DialogTrigger>

          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Connect WhatsApp Instance</DialogTitle>
              <DialogDescription className="text-muted-foreground">Step {onboardingStep} of 3</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 py-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                      step <= onboardingStep ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {step}
                  </div>
                  {step < 3 && <div className={cn("flex-1 h-0.5 mx-2", step < onboardingStep ? "bg-primary" : "bg-border")} />}
                </div>
              ))}
            </div>

            <div className="py-4">
              {onboardingStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Instance Name</Label>
                    <Input
                      placeholder="e.g., botzap-principal"
                      className="bg-secondary border-border"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                    />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Dica: nome curto, sem espaço. Ex: <span className="text-foreground">clinica-01</span>
                  </p>

                  {onboardMut.isError && (
                    <div className="text-xs text-destructive">
                      Falha: {String((onboardMut.error as any)?.message || onboardMut.error)}
                    </div>
                  )}
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-4 text-center">
                  <div className="w-48 h-48 mx-auto bg-secondary rounded-xl flex items-center justify-center border border-border overflow-hidden">
                    {qrSrc ? (
                      <img src={qrSrc} alt="QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <QrCode className="w-32 h-32 text-muted-foreground" />
                    )}
                  </div>

                  {onboardMode?.toLowerCase() === "demo" ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="text-foreground font-semibold">Modo DEMO:</span> instância foi cadastrada.
                      Quando você tiver Evolution ativo, a conexão por QR vai funcionar e os eventos vão entrar.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      WhatsApp → Configurações → Aparelhos conectados → Conectar → Escaneie o QR
                    </p>
                  )}

                  <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setOnboardingStep(1)}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Voltar / Regerar
                  </Button>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">Select which events to receive:</p>

                  {["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"].map((ev) => (
                    <label
                      key={ev}
                      className="flex items-center gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors"
                    >
                      <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} className="w-4 h-4 accent-primary" />
                      <span className="text-foreground text-sm">{ev}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              {onboardingStep > 1 && (
                <Button variant="ghost" onClick={() => setOnboardingStep((s) => s - 1)} className="text-muted-foreground">
                  Back
                </Button>
              )}

              {onboardingStep < 3 ? (
                <Button className="btn-premium" onClick={onNext} disabled={onboardMut.isPending}>
                  {onboardingStep === 1 ? (onboardMut.isPending ? "Creating..." : "Create") : "Next"}
                </Button>
              ) : (
                <Button className="btn-premium" onClick={resetOnboarding}>
                  Finish
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {instances.length} instance(s)
        </div>
        <Button variant="outline" size="sm" className="border-border text-muted-foreground" onClick={() => instancesQ.refetch()}>
          <RefreshCw className={cn("w-4 h-4 mr-2", instancesQ.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {instances.map((inst) => (
          <InstanceCard key={inst.id} inst={inst} />
        ))}
      </div>
    </div>
  );
}

function InstanceCard({ inst }: { inst: InstanceApi }) {
  const uiStatus = mapUiStatus(inst);
  const isConnected = uiStatus === "connected";
  const mode = String(inst.mode || "").toLowerCase();

  return (
    <Card className={cn("bg-card border-border transition-all duration-300", isConnected && "glow-success")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", isConnected ? "bg-success/10" : "bg-destructive/10")}>
              {isConnected ? <Wifi className="w-6 h-6 text-success" /> : <WifiOff className="w-6 h-6 text-destructive" />}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">{inst.instance_name}</CardTitle>
              <p className="text-sm text-muted-foreground">{inst.phone || "-"}</p>
              {mode === "demo" && <p className="text-xs text-muted-foreground mt-1">DEMO</p>}
            </div>
          </div>

          <StatusBadge status={uiStatus} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs">Status</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{String(inst.status || uiStatus)}</p>
          </div>

          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Smartphone className="w-4 h-4" />
              <span className="text-xs">Mode</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{mode || "-"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last ping</span>
          <span className={cn("font-medium", isConnected ? "text-success" : "text-destructive")}>
            {fmtLastPing(inst.last_seen_at || inst.updated_at)}
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-muted-foreground border-border" disabled>
            Disconnect
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-muted-foreground border-border" disabled>
            Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
