interface HeaderProps {
  streakAtual?: number | null;
}

const Header = ({ streakAtual }: HeaderProps) => {
  return (
    <header className="sticky top-0 z-50 bg-surface-inverse" style={{ height: '52px' }}>
      <div className="container flex h-full items-center justify-between">
        <span className="font-serif italic text-lg text-white tracking-tight">
          MedUpdate
        </span>
        <div className="flex items-center gap-3">
          {streakAtual !== null && streakAtual !== undefined && streakAtual >= 3 && (
            <span className="font-mono text-sm text-white">
              🔥 {streakAtual}
            </span>
          )}
          <span className="font-mono text-[0.72rem] text-white/60 border border-white/15 px-2.5 py-1 rounded">
            Cardiologia
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
