const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          MedUpdate
        </span>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Cardiologia
        </span>
      </div>
    </header>
  );
};

export default Header;
