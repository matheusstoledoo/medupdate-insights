create or replace function atualizar_streak(p_usuario_id uuid)
returns void as $$
declare
  v_hoje date := current_date;
  v_ontem date := current_date - interval '1 day';
  v_streak streaks%rowtype;
begin
  select * into v_streak from streaks where usuario_id = p_usuario_id;
  
  if not found then
    insert into streaks (usuario_id, streak_atual, streak_maximo, ultimo_dia_ativo, total_questoes_respondidas)
    values (p_usuario_id, 1, 1, v_hoje, 1);
    return;
  end if;

  if v_streak.ultimo_dia_ativo = v_hoje then
    update streaks 
    set total_questoes_respondidas = total_questoes_respondidas + 1,
        updated_at = now()
    where usuario_id = p_usuario_id;
    return;
  end if;

  if v_streak.ultimo_dia_ativo = v_ontem then
    update streaks
    set streak_atual = streak_atual + 1,
        streak_maximo = greatest(streak_maximo, streak_atual + 1),
        ultimo_dia_ativo = v_hoje,
        total_questoes_respondidas = total_questoes_respondidas + 1,
        updated_at = now()
    where usuario_id = p_usuario_id;
    return;
  end if;

  update streaks
  set streak_atual = 1,
      ultimo_dia_ativo = v_hoje,
      total_questoes_respondidas = total_questoes_respondidas + 1,
      updated_at = now()
  where usuario_id = p_usuario_id;
end;
$$ language plpgsql security definer set search_path = public;