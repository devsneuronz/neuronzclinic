alter table public.routine_actions
  add column if not exists blocks_ai_reply boolean not null default true;

comment on column public.routine_actions.blocks_ai_reply is
  'Quando true em uma ação send_message, impede a resposta automática da IA para o evento que disparou a rotina.';
