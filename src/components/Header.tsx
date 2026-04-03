interface HeaderProps {
  streakAtual?: number | null;
}

const Header = ({ streakAtual }: HeaderProps) => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          MedUpdate
        </span>
        <div className="flex items-center gap-3">
          {streakAtual !== null && streakAtual !== undefined && streakAtual >= 3 && (
            <span className="font-mono text-sm text-orange-400">
              🔥 {streakAtual}
            </span>
          )}
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Cardiologia
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
