import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ensureUsuario = async (u: User) => {
      try {
        await supabase.from("usuarios").upsert({
          id: u.id,
          email: u.email,
          nome:
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0],
        }, { onConflict: "id" });
      } catch (e) {
        console.error("Erro ao sincronizar usuario:", e);
      }
    };

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === "SIGNED_IN" && session?.user) {
          setTimeout(() => ensureUsuario(session.user), 0);
        }
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
