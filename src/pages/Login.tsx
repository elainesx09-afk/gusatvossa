import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { signInWithPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    const r = await signInWithPassword(email.trim(), password);
    setBusy(false);

    if (!r.ok) {
      setErr(r.error);
      return;
    }

    nav("/overview", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-bold font-display tracking-tight text-foreground">
            Entrar
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Acesso do cliente (workspace isolado).
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm text-foreground">Email</label>
              <Input
                className="bg-secondary border-border"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground">Senha</label>
              <Input
                className="bg-secondary border-border"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
              />
            </div>

            {err && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                {err}
              </div>
            )}

            <Button className="btn-premium w-full" disabled={busy || !email || !password}>
              {busy ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
