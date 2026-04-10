import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BookmarkPlus, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  artigoId: string;
}

const AddToReviewButton = ({ artigoId }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: existingReview } = useQuery({
    queryKey: ["revisao-artigo", artigoId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revisoes_artigo")
        .select("id, proxima_revisao")
        .eq("artigo_id", artigoId)
        .eq("usuario_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("revisoes_artigo").insert({
        usuario_id: user!.id,
        artigo_id: artigoId,
        proxima_revisao: new Date().toISOString(),
        state: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revisao-artigo", artigoId] });
      queryClient.invalidateQueries({ queryKey: ["revisoes-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["revisoes"] });
      toast.success("Artigo adicionado à fila de revisões!");
    },
    onError: () => toast.error("Erro ao adicionar revisão"),
  });

  if (!user) return null;

  if (existingReview) {
    const dias = existingReview.proxima_revisao
      ? Math.max(0, Math.ceil((new Date(existingReview.proxima_revisao).getTime() - Date.now()) / 86400000))
      : 0;
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-6 pt-4 border-t">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {dias <= 0 ? "Revisão pendente hoje" : `Próxima revisão em ${dias} dia${dias > 1 ? "s" : ""}`}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => addMutation.mutate()}
      disabled={addMutation.isPending}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mt-6 pt-4 border-t transition-colors disabled:opacity-50"
    >
      <BookmarkPlus className="h-3.5 w-3.5" />
      <span>Adicionar à fila de revisões</span>
    </button>
  );
};

export default AddToReviewButton;
