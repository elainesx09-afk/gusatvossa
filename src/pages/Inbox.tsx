import { useEffect, useMemo, useState } from "react";
import { Search, Send, Phone, UserPlus, ArrowRight, Image, Mic, MoreHorizontal, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

type MessageApi = {
  id: string;
  workspace_id: string;
  lead_id: string;
  direction: "in" | "out";
  message_type: string;
  text?: string | null;
  created_at: string;
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
  return s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "L";
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

async function getMessages(leadId: string): Promise<MessageApi[]> {
  const base = BASE();
  const token = TOKEN();
  if (!base || !token) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN");

  const r = await fetch(`${base}/api/messages?lead_id=${encodeURIComponent(leadId)}`, { headers: headers() });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j.messages ?? [];
}

async function sendMessage(args: { leadId: string; text: string }) {
  const base = BASE();
  const token = TOKEN();
  const workspaceId = WORKSPACE();
  if (!base || !token || !workspaceId) throw new Error("Env faltando: VITE_API_BASE_URL, VITE_API_TOKEN, VITE_WORKSPACE_ID");

  const body = {
    workspace_id: workspaceId,
    lead_id: args.leadId,
    direction: "out",
    message_type: "text",
    text: args.text,
  };

  const r = await fetch(`${base}/api/messages`, {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.details?.message || `HTTP ${r.status}`);
  if (!j?.ok) throw new Error(j?.error || "ok=false");
  return j;
}

export default function Inbox() {
  const qc = useQueryClient();
  const location = useLocation();

  const leadFromUrl = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get("lead_id");
  }, [location.search]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");

  const leadsQ = useQuery({
    queryKey: ["leads", WORKSPACE()],
    queryFn: getLeads,
    staleTime: 10_000,
    retry: 1,
  });

  const leads = leadsQ.data ?? [];

  useEffect(() => {
    if (!leads.length) return;

    if (leadFromUrl) {
      const exists = leads.some((l) => l.id === leadFromUrl);
      if (exists) {
        setSelectedLeadId(leadFromUrl);
        return;
      }
    }

    if (!selectedLeadId) setSelectedLeadId(leads[0].id);
  }, [leads, leadFromUrl, selectedLeadId]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const name = String(l.name || "Lead").toLowerCase();
      const phone = String(l.phone || "");
      const last = String(l.last_message || "").toLowerCase();
      return name.includes(q) || phone.includes(searchQuery.trim()) || last.includes(q);
    });
  }, [leads, searchQuery]);

  const messagesQ = useQuery({
    queryKey: ["messages", selectedLeadId],
    queryFn: () => getMessages(selectedLeadId as string),
    enabled: !!selectedLeadId,
    staleTime: 2_000,
    retry: 1,
  });

  const messages = (messagesQ.data ?? []).slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const sendMut = useMutation({
    mutationFn: sendMessage,
    onSuccess: async () => {
      setMessageInput("");
      await qc.invalidateQueries({ queryKey: ["messages", selectedLeadId] });
      await qc.invalidateQueries({ queryKey: ["leads", WORKSPACE()] });
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
      {/* Conversations List */}
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

            <Button variant="outline" size="icon" className="border-border" onClick={() => leadsQ.refetch()} title="Atualizar leads">
              <RefreshCw className={cn("w-4 h-4", leadsQ.isFetching && "animate-spin")} />
            </Button>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary">All</Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">Active</Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">Waiting</Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">Resolved</Badge>
          </div>

          {leadsQ.isError && (
            <div className="text-xs text-destructive">Erro leads: {String((leadsQ.error as any)?.message || leadsQ.error)}</div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredLeads.map((lead) => {
              const name = lead.name || "Lead";
              const lastAt = lead.last_message_at || lead.updated_at || lead.created_at;
              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                    selectedLeadId === lead.id ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary/50"
                  )}
                >
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-sm font-semibold text-foreground">{initials(name)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate">{name}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{fmtTime(lastAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{lead.last_message || "-"}</p>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
                        {lead.stage || "novo"}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">{initials(selectedLead.name)}</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{selectedLead.name || "Lead"}</h3>
                <p className="text-xs text-muted-foreground">{selectedLead.phone || "-"}</p>
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
              <Button variant="outline" size="icon" className="border-border" onClick={() => messagesQ.refetch()} title="Atualizar mensagens">
                <RefreshCw className={cn("w-4 h-4", messagesQ.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messagesQ.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Erro mensagens: {String((messagesQ.error as any)?.message || messagesQ.error)}
                </div>
              )}

              {!messagesQ.isLoading && messages.length === 0 && (
                <div className="text-sm text-muted-foreground">Sem mensagens ainda.</div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "in" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-4 py-2",
                      m.direction === "in"
                        ? "bg-secondary text-foreground rounded-bl-sm"
                        : "bg-primary text-primary-foreground rounded-br-sm"
                    )}
                  >
                    <p className="text-sm">{m.text || "-"}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className={cn("text-[10px]", m.direction === "in" ? "text-muted-foreground" : "text-primary-foreground/70")}>
                        {fmtTime(m.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

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
                onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
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
