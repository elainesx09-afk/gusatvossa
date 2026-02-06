import { useMemo, useState } from "react";
import { Search, Send, Phone, UserPlus, ArrowRight, Image, Mic, MoreHorizontal, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type LeadStage = "novo" | "qualificando" | "proposta" | "follow-up" | "ganhou" | "perdido";

type LeadApi = {
  id: string;
  workspace_id: string;
  name?: string | null;
  phone?: string | null;
  stage?: LeadStage | null;
  last_message?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type MessageApi = {
  id: string;
  workspace_id: string;
  lead_id: string;
  direction: "in" | "out";
  message_type: "text" | "image" | "audio" | string;
  text?: string | null;
  media_url?: string | null;
  media_base64?: string | null;
  created_at: string;
  provider_message_id?: string | null;
};

function envOrThrow(name: string) {
  const v = (import.meta as any).env?.[name];
  return String(v || "");
}

function apiBase() {
  return envOrThrow("VITE_API_BASE_URL").replace(/\/$/, "");
}

function apiHeaders() {
  return { "x-api-token": envOrThrow("VITE_API_TOKEN") };
}

function workspaceId() {
  return envOrThrow("VITE_WORKSPACE_ID");
}

async function apiGetLeads(): Promise<LeadApi[]> {
  const base = apiBase();
  const token = envOrThrow("VITE_API_TOKEN");
  const ws = workspaceId();
  if (!base || !token || !ws) throw new Error("Missing VITE envs");

  const r = await fetch(`${base}/api/leads?workspace_id=${encodeURIComponent(ws)}`, {
    headers: apiHeaders(),
  });

  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error || json?.details?.message || `HTTP ${r.status}`);
  if (!json?.ok) throw new Error(json?.error || "API ok=false");

  return (json.leads ?? []) as LeadApi[];
}

async function apiGetMessages(leadId: string): Promise<MessageApi[]> {
  const base = apiBase();
  const token = envOrThrow("VITE_API_TOKEN");
  if (!base || !token) throw new Error("Missing VITE envs");

  const r = await fetch(`${base}/api/messages?lead_id=${encodeURIComponent(leadId)}`, {
    headers: apiHeaders(),
  });

  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error || json?.details?.message || `HTTP ${r.status}`);
  if (!json?.ok) throw new Error(json?.error || "API ok=false");

  return (json.messages ?? []) as MessageApi[];
}

// Enviar via mock (porque grava no DB e já funcionou pra você)
async function apiSendMockInbound(args: { leadId: string; text: string; from?: string }) {
  const base = apiBase();
  const ws = workspaceId();
  const token = envOrThrow("VITE_API_TOKEN");
  if (!base || !token || !ws) throw new Error("Missing VITE envs");

  const body = {
    workspace_id: ws,
    lead_id: args.leadId,
    from: args.from || "5511999999999",
    text: args.text,
  };

  const r = await fetch(`${base}/api/mock-inbound`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error || json?.details?.message || `HTTP ${r.status}`);
  if (!json?.ok) throw new Error(json?.error || "API ok=false");
  return json;
}

function initials(name: string) {
  const s = (name || "").trim();
  if (!s) return "L";
  return s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function Inbox() {
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");

  const leadsQ = useQuery({
    queryKey: ["leads", workspaceId()],
    queryFn: apiGetLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const leads = leadsQ.data ?? [];

  // Seleciona o primeiro lead automaticamente quando carregar
  useMemo(() => {
    if (!selectedLeadId && leads.length > 0) setSelectedLeadId(leads[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;

    return leads.filter((l) => {
      const name = (l.name || "Lead").toLowerCase();
      const phone = String(l.phone || "");
      const last = String(l.last_message || "").toLowerCase();
      return name.includes(q) || phone.includes(searchQuery.trim()) || last.includes(q);
    });
  }, [leads, searchQuery]);

  const messagesQ = useQuery({
    queryKey: ["messages", selectedLeadId],
    queryFn: () => apiGetMessages(selectedLeadId as string),
    enabled: !!selectedLeadId,
    staleTime: 3_000,
    retry: 1,
  });

  const messages = (messagesQ.data ?? []).slice().sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const sendMut = useMutation({
    mutationFn: apiSendMockInbound,
    onSuccess: async () => {
      setMessageInput("");
      await qc.invalidateQueries({ queryKey: ["messages", selectedLeadId] });
      await qc.invalidateQueries({ queryKey: ["leads", workspaceId()] });
    },
  });

  const onSend = async () => {
    if (!selectedLeadId) return;
    const text = messageInput.trim();
    if (!text) return;

    await sendMut.mutateAsync({ leadId: selectedLeadId, text });
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
      {/* Conversations List = Leads */}
      <div className="w-96 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-10 bg-secondary border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="border-border"
              onClick={() => leadsQ.refetch()}
              title="Atualizar"
            >
              <RefreshCw className={cn("w-4 h-4", leadsQ.isFetching && "animate-spin")} />
            </Button>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              All
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-secondary/80 border-border text-muted-foreground"
            >
              Active
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-secondary/80 border-border text-muted-foreground"
            >
              Waiting
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-secondary/80 border-border text-muted-foreground"
            >
              Resolved
            </Badge>
          </div>

          {leadsQ.isError && (
            <div className="text-xs text-destructive">
              Erro: {String((leadsQ.error as any)?.message || leadsQ.error)}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredLeads.map((lead) => {
              const leadName = (lead.name && String(lead.name).trim()) || "Lead";
              const lastAt = lead.last_message_at || lead.updated_at || lead.created_at;
              const lastMsg = lead.last_message || "-";

              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                    selectedLeadId === lead.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-secondary/50"
                  )}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-sm font-semibold text-foreground">{initials(leadName)}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate">{leadName}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {fmtTime(lastAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{lastMsg}</p>
                    <div className="flex gap-1 mt-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-border text-muted-foreground"
                      >
                        {lead.stage || "novo"}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}

            {!leadsQ.isLoading && filteredLeads.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum lead encontrado.</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {initials((selectedLead.name as any) || "Lead")}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{selectedLead.name || "Lead"}</h3>
                <p className="text-xs text-muted-foreground">{selectedLead.phone || "-"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Lead ID: <span className="opacity-80">{selectedLead.id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-muted-foreground border-border">
                <Phone className="w-4 h-4 mr-2" />
                Call
              </Button>
              <Button variant="outline" size="sm" className="text-muted-foreground border-border">
                <UserPlus className="w-4 h-4 mr-2" />
                Transfer
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-2 border-b border-border flex gap-2 overflow-x-auto">
            <Button variant="outline" size="sm" className="text-xs whitespace-nowrap border-border text-muted-foreground hover:text-foreground">
              Transferir p/ humano
            </Button>
            <Button variant="outline" size="sm" className="text-xs whitespace-nowrap border-border text-muted-foreground hover:text-foreground">
              Marcar como qualificado
            </Button>
            <Button variant="outline" size="sm" className="text-xs whitespace-nowrap border-border text-muted-foreground hover:text-foreground">
              Agendar follow-up
            </Button>
            <Button variant="outline" size="sm" className="text-xs whitespace-nowrap border-border text-muted-foreground hover:text-foreground">
              <ArrowRight className="w-3 h-3 mr-1" />
              Mover no pipeline
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {messagesQ.isFetching ? "Carregando..." : `Msgs: ${messages.length}`}
              </span>
              <Button variant="outline" size="icon" className="border-border" onClick={() => messagesQ.refetch()} title="Atualizar mensagens">
                <RefreshCw className={cn("w-4 h-4", messagesQ.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messagesQ.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Erro carregando mensagens: {String((messagesQ.error as any)?.message || messagesQ.error)}
                </div>
              )}

              {!messagesQ.isLoading && messages.length === 0 && (
                <div className="text-sm text-muted-foreground">Sem mensagens ainda.</div>
              )}

              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground" disabled>
                <Image className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground" disabled>
                <Mic className="w-5 h-5" />
              </Button>

              <Input
                placeholder="Type a message..."
                className="flex-1 bg-secondary border-border"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSend();
                }}
              />

              <Button className="btn-premium" size="icon" onClick={onSend} disabled={sendMut.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {sendMut.isError && (
              <div className="mt-2 text-xs text-destructive">
                Falha ao enviar: {String((sendMut.error as any)?.message || sendMut.error)}
              </div>
            )}

            <div className="mt-2 text-[10px] text-muted-foreground">
              Envio atual: <span className="opacity-80">POST /api/mock-inbound</span> · salvo como mensagem <span className="opacity-80">direction=in</span>
              <span className="opacity-60"> · {fmtDateTime(new Date().toISOString())}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-card border border-border rounded-xl">
          <p className="text-muted-foreground">Select a conversation to start chatting</p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: MessageApi }) {
  const isInbound = message.direction === "in"; // inbound = usuário (cliente)
  const bubbleSide = isInbound ? "justify-start" : "justify-end";
  const bubbleStyle = isInbound
    ? "bg-secondary text-foreground rounded-bl-sm"
    : "bg-primary text-primary-foreground rounded-br-sm";

  const timestamp = fmtTime(message.created_at);

  return (
    <div className={cn("flex", bubbleSide)}>
      <div className={cn("max-w-[70%] rounded-2xl px-4 py-2", bubbleStyle)}>
        {message.message_type === "audio" && (
          <div className="flex items-center gap-2 py-1">
            <Mic className="w-4 h-4" />
            <div className="w-24 h-1 bg-current/30 rounded-full" />
            <span className="text-xs">audio</span>
          </div>
        )}

        {message.message_type === "image" && (
          <div className="w-48 h-32 bg-secondary/50 rounded-lg flex items-center justify-center mb-2">
            <Image className="w-8 h-8 text-muted-foreground" />
          </div>
        )}

        {message.message_type === "text" && <p className="text-sm">{message.text || "-"}</p>}
        {message.message_type !== "text" && message.message_type !== "image" && message.message_type !== "audio" && (
          <p className="text-sm">{message.text || "[unsupported message type]"}</p>
        )}

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={cn("text-[10px]", isInbound ? "text-muted-foreground" : "text-primary-foreground/70")}>
            {timestamp}
          </span>
        </div>
      </div>
    </div>
  );
}
