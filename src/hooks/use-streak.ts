import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useStreak() {
  const [streakAtual, setStreakAtual] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStreak = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("streaks")
        .select("streak_atual")
        .eq("usuario_id", user.id)
        .maybeSingle();
      if (data) {
        setStreakAtual(data.streak_atual);
      }
      setLoading(false);
    };
    fetchStreak();
  }, []);

  return { streakAtual, loading };
}
