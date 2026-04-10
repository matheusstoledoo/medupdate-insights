import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  streakAtual?: number | null;
}

const Header = ({ streakAtual }: HeaderProps) => {
  const { user } = useAuth();
  const location = useLocation();

  const { data: pendentes } = useQuery({
    queryKey: ["revisoes-pendentes", user?.id],
    queryFn: async () => {
      const hoje = new Date();
      hoje.setDate(hoje.getDate() + 1);
      hoje.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from("revisoes_artigo")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", user!.id)
        .lte("proxima_revisao", hoje.toISOString());

      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const navItems = [
    { to: "/feed", label: "Feed" },
    { to: "/revisoes", label: "Revisões", badge: pendentes && pendentes > 0 ? pendentes : null },
  ];

  return (
    <header className="sticky top-0 z-50 bg-surface-inverse" style={{ height: '52px' }}>
      <div className="container flex h-full items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/feed" className="font-serif italic text-lg text-white tracking-tight">
            MedUpdate
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative px-3 py-1.5 rounded text-[0.78rem] font-medium transition-colors ${
                    isActive
                      ? "text-white bg-white/15"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                  {item.badge != null && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
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
