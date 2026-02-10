export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-white/90 p-2 border border-border">
        <img
          src={compact ? "/brand/oneeleven-mark.png" : "/brand/oneeleven-logo.png"}
          alt="ONE ELEVEN"
          className={compact ? "h-8 w-8" : "h-8 w-auto"}
          draggable={false}
        />
      </div>

      {/* Se quiser SEM texto, apaga esse bloco */}
      <div className="hidden sm:block leading-tight">
        <div className="text-sm font-semibold tracking-[0.22em]">ONE ELEVEN</div>
        <div className="text-xs text-muted-foreground">WhatsApp + IA + CRM</div>
      </div>
    </div>
  );
}
