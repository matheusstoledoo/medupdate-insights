create table streaks (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete cascade unique,
  streak_atual integer default 0,
  streak_maximo integer default 0,
  ultimo_dia_ativo date,
  total_questoes_respondidas integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table streaks enable row level security;

create policy "usuarios veem proprio streak"
on streaks for select
using (auth.uid() = usuario_id);

create policy "usuarios atualizam proprio streak"
on streaks for all
using (auth.uid() = usuario_id);

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
$$ language plpgsql security definer;
