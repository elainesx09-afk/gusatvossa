import { useMemo, useState, useEffect } from 'react';
import { Plus, Play, Pause, Edit, Trash2, Clock, Users, Trophy, ChevronRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type FollowUpStep = {
  id: string;
  day: string;
  message: string;
  objective: string;
  trigger: string;
};

type FollowUpSequence = {
  id: string;
  name: string;
  description: string;
  steps: FollowUpStep[];
  active: boolean;
  leadsEnrolled: number;
  conversions: number;
};

function WORKSPACE_ID() {
  return (import.meta as any).env?.VITE_WORKSPACE_ID || 'default';
}
function storageKey() {
  return `oneeleven_followups_v1:${WORKSPACE_ID()}`;
}

function seedSequences(): FollowUpSequence[] {
  return [
    {
      id: 'seq-1',
      name: 'Sequência 7 dias',
      description: 'Sequência padrão para leads sem resposta',
      active: true,
      leadsEnrolled: 0,
      conversions: 0,
      steps: [
        { id: 's1', day: 'D+0', message: 'Oi [NOME]! Ainda posso te ajudar com isso?', objective: 'Reengajar', trigger: 'Sem resposta em 24h' },
        { id: 's2', day: 'D+1', message: '[NOME], separo uma condição especial pra você hoje. Quer ver?', objective: 'Criar urgência', trigger: 'Sem resposta' },
        { id: 's3', day: 'D+3', message: '[NOME], posso te mandar um resumo e te ajudar a decidir em 2 min?', objective: 'Remover atrito', trigger: 'Sem resposta' },
        { id: 's4', day: 'D+7', message: 'Último toque, [NOME]. Se quiser retomar, é só responder aqui.', objective: 'Porta aberta', trigger: 'Sem resposta' },
      ],
    },
  ];
}

export default function FollowUps() {
  const [rulesEnabled, setRulesEnabled] = useState({
    noPriceInvention: true,
    respectStop: true,
    noPromises: true,
    humanHandoff: true,
  });

  const [sequences, setSequences] = useState<FollowUpSequence[]>(() => {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as FollowUpSequence[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {}
    }
    return seedSequences();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(sequences));
    } catch {}
  }, [sequences]);

  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);

  const selectedSequence = useMemo(
    () => sequences.find((s) => s.id === selectedSequenceId) || null,
    [sequences, selectedSequenceId]
  );

  const [draft, setDraft] = useState<FollowUpSequence | null>(null);

  useEffect(() => {
    if (selectedSequence) setDraft(JSON.parse(JSON.stringify(selectedSequence)));
    else setDraft(null);
  }, [selectedSequenceId]);

  const createSequence = () => {
    const id = `seq-${crypto.randomUUID()}`;
    const newSeq: FollowUpSequence = {
      id,
      name: 'Nova Sequência',
      description: 'Descrição da sequência',
      active: false,
      leadsEnrolled: 0,
      conversions: 0,
      steps: [
        { id: `s-${crypto.randomUUID()}`, day: 'D+0', message: 'Mensagem...', objective: 'Objetivo', trigger: 'Trigger' },
      ],
    };
    setSequences([newSeq, ...sequences]);
    setSelectedSequenceId(id);
  };

  const toggleActive = (id: string) => {
    setSequences(sequences.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  };

  const deleteSeq = (id: string) => {
    setSequences(sequences.filter((s) => s.id !== id));
    if (selectedSequenceId === id) setSelectedSequenceId(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    setSequences(sequences.map((s) => (s.id === draft.id ? draft : s)));
    setSelectedSequenceId(null);
  };

  const addStep = () => {
    if (!draft) return;
    const next: FollowUpSequence = {
      ...draft,
      steps: [
        ...draft.steps,
        { id: `s-${crypto.randomUUID()}`, day: `D+${draft.steps.length}`, message: 'Mensagem...', objective: 'Objetivo', trigger: 'Trigger' },
      ],
    };
    setDraft(next);
  };

  const updateStep = (idx: number, patch: Partial<FollowUpStep>) => {
    if (!draft) return;
    const steps = [...draft.steps];
    steps[idx] = { ...steps[idx], ...patch };
    setDraft({ ...draft, steps });
  };

  const removeStep = (idx: number) => {
    if (!draft) return;
    const steps = [...draft.steps];
    steps.splice(idx, 1);
    setDraft({ ...draft, steps });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Follow-ups</h1>
          <p className="text-muted-foreground mt-1">Automated follow-up sequences engine</p>
        </div>
        <Button className="btn-premium" onClick={createSequence}>
          <Plus className="w-4 h-4 mr-2" />
          Create Sequence
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {sequences.map((seq) => (
            <SequenceCard
              key={seq.id}
              sequence={seq}
              onEdit={() => setSelectedSequenceId(seq.id)}
              onToggle={() => toggleActive(seq.id)}
              onDelete={() => deleteSeq(seq.id)}
            />
          ))}
        </div>

        <Card className="bg-card border-border h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-warning" />
              Regras Anti-Loucura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Proteções automáticas para evitar problemas com leads</p>

            <div className="space-y-3">
              <RuleToggle
                label="Não inventar preço"
                description="O bot nunca inventa valores ou promoções"
                enabled={rulesEnabled.noPriceInvention}
                onChange={(v) => setRulesEnabled({ ...rulesEnabled, noPriceInvention: v })}
              />
              <RuleToggle
                label="Respeitar STOP"
                description="Para imediatamente se cliente pedir"
                enabled={rulesEnabled.respectStop}
                onChange={(v) => setRulesEnabled({ ...rulesEnabled, respectStop: v })}
              />
              <RuleToggle
                label="Não prometer resultado"
                description="Evita garantias e promessas falsas"
                enabled={rulesEnabled.noPromises}
                onChange={(v) => setRulesEnabled({ ...rulesEnabled, noPromises: v })}
              />
              <RuleToggle
                label="Handoff humano"
                description="Transfere quando necessário"
                enabled={rulesEnabled.humanHandoff}
                onChange={(v) => setRulesEnabled({ ...rulesEnabled, humanHandoff: v })}
              />
            </div>

            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-success">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                All rules active
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!draft} onOpenChange={() => setSelectedSequenceId(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Sequence: {draft?.name}</DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Sequence Name</label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>

              <Separator className="bg-border" />

              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Steps</h4>

                {draft.steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    onRemove={() => removeStep(index)}
                    onChange={(patch) => updateStep(index, patch)}
                  />
                ))}

                <Button variant="outline" className="w-full border-dashed border-border text-muted-foreground" onClick={addStep}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setSelectedSequenceId(null)} className="text-muted-foreground">
                  Cancel
                </Button>
                <Button className="btn-premium" onClick={saveDraft}>
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SequenceCard({
  sequence,
  onEdit,
  onToggle,
  onDelete,
}: {
  sequence: FollowUpSequence;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn('bg-card border-border transition-all', sequence.active && 'glow-success')}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg text-foreground">{sequence.name}</h3>
              <Badge
                variant={sequence.active ? 'default' : 'secondary'}
                className={sequence.active ? 'bg-success/20 text-success border-success/30' : ''}
              >
                {sequence.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{sequence.description}</p>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={onToggle}>
              {sequence.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onEdit} className="text-muted-foreground hover:text-foreground">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          {sequence.steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="bg-secondary rounded-lg px-3 py-2 text-center min-w-[80px]">
                <p className="text-xs font-medium text-primary">{step.day}</p>
                <p className="text-[10px] text-muted-foreground truncate max-w-[70px]">{step.objective}</p>
              </div>
              {index < sequence.steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />}
            </div>
          ))}
        </div>

        <div className="flex gap-6 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{sequence.leadsEnrolled} enrolled</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-warning" />
            <span className="text-sm text-foreground">{sequence.conversions} conversions</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{sequence.steps.length} steps</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepEditor({
  step,
  index,
  onRemove,
  onChange,
}: {
  step: FollowUpStep;
  index: number;
  onRemove: () => void;
  onChange: (patch: Partial<FollowUpStep>) => void;
}) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{step.day}</span>
          </div>
          <div>
            <p className="font-medium text-foreground">Step {index + 1}</p>
            <p className="text-xs text-muted-foreground">{step.trigger}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <Textarea
        value={step.message}
        onChange={(e) => onChange({ message: e.target.value })}
        className="bg-secondary border-border text-sm"
        rows={2}
      />

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Objective</label>
          <Input
            value={step.objective}
            onChange={(e) => onChange({ objective: e.target.value })}
            className="bg-secondary border-border text-sm mt-1"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Trigger</label>
          <Input
            value={step.trigger}
            onChange={(e) => onChange({ trigger: e.target.value })}
            className="bg-secondary border-border text-sm mt-1"
          />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Day</label>
          <Input
            value={step.day}
            onChange={(e) => onChange({ day: e.target.value })}
            className="bg-secondary border-border text-sm mt-1"
          />
        </div>
      </div>
    </div>
  );
}

function RuleToggle({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-secondary/50 rounded-lg">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}
