# Workflow n8n para Rotinas

Este desenho usa n8n como orquestrador e deixa o app como backend seguro para criar a fila no Supabase.

## Caminho rápido

1. No Supabase, rode o SQL da seção "SQL no Supabase".
2. No n8n, importe estes dois arquivos:
   - `docs/n8n-rotinas-event-workflow.json`
   - `docs/n8n-rotinas-due-workflow.json`
3. No n8n, configure as variáveis:
   - `APP_BASE_URL`
   - `ROUTINES_WEBHOOK_SECRET`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` opcional, pode deixar vazio para usar `gpt-4o-mini`.
4. Ative o workflow `Neuronz - Rotinas - Evento de contato`.
5. Copie a Production URL do Webhook `contact-routine-event`.
6. No `.env.local` do app, confirme:

```env
ROUTINES_EVENT_WEBHOOK_URL=https://n8n.srv1150529.hstgr.cloud/webhook/contact-routine-event
ROUTINES_WEBHOOK_SECRET=mesmo_segredo_do_n8n
```

7. Reinicie o app.
8. Adicione uma tag em um contato pela tela do app.
9. Veja a execução no n8n e depois confira `routine_runs` e `routine_action_runs` no Supabase.

## Variáveis necessárias

No app:

```env
ROUTINES_WEBHOOK_SECRET=gere_um_segredo_longo
ROUTINES_EVENT_WEBHOOK_URL=https://seu-n8n.com/webhook/contact-routine-event
AIRTABLE_ROUTINES_TABLE=tblTOHnzJW7tOBTHc
AIRTABLE_ROUTINE_PROCESSES_TABLE=tblnjiV1h19XRU89j
```

No n8n:

```env
APP_BASE_URL=https://seu-app.com
ROUTINES_WEBHOOK_SECRET=o_mesmo_segredo_do_app
```

## SQL no Supabase

```sql
create table if not exists routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_airtable_id text not null,
  routine_name text,
  contact_id text not null,
  contact_airtable_id text,
  chat_id text,
  contact_name text,
  contact_phone text,
  trigger_type text not null,
  trigger_target text,
  status text not null default 'running',
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists routine_action_runs (
  id uuid primary key default gen_random_uuid(),
  routine_run_id uuid not null references routine_runs(id) on delete cascade,
  action_id text not null,
  action_index int not null,
  action_type text not null,
  execute_at timestamptz not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists routine_action_runs_due_idx
on routine_action_runs (status, execute_at);
```

## Workflow 1: Entrada de eventos de contato

### 1. Webhook

Node: `Webhook`

- Method: `POST`
- Path: `contact-routine-event`
- Response mode: `Using Respond to Webhook Node`

Payload esperado:

```json
{
  "event_type": "tag_added",
  "contact_airtable_id": "recContato",
  "chat_id": "5511999999999",
  "contact_name": "Nome do contato",
  "contact_phone": "5511999999999",
  "tag": {
    "id": "recTag",
    "label": "Indicação"
  },
  "status": null,
  "previous": {},
  "current": {}
}
```

### 2. Code: normalizar evento

Node: `Code`

```js
const body = $json.body ?? $json;

const eventType = String(body.event_type || body.eventType || '').toLowerCase();
const tag = body.tag || {};
const status = body.status || {};

let trigger = 'manual';
let targetId = '';
let targetLabel = '';

if (eventType.includes('tag')) {
  trigger = 'tag';
  targetId = String(tag.id || body.tag_id || body.target_id || '');
  targetLabel = String(tag.label || body.tag_label || body.target_label || '');
}

if (eventType.includes('status')) {
  trigger = 'status';
  targetLabel = String(status.label || body.status_label || body.target_label || body.status || '');
}

if (eventType.includes('birthday') || eventType.includes('anivers')) {
  trigger = 'birthday';
  targetLabel = 'Aniversário';
}

return [{
  json: {
    raw: body,
    trigger,
    targetId,
    targetLabel,
    contactId: String(body.contact_id || body.chat_id || body.contact_airtable_id || ''),
    contactAirtableId: String(body.contact_airtable_id || body.airtable_contact_id || ''),
    chatId: String(body.chat_id || body.phone || ''),
    contactName: String(body.contact_name || body.nome_contato || body.name || ''),
    contactPhone: String(body.contact_phone || body.phone || body.chat_id || ''),
    occurredAt: body.occurred_at || new Date().toISOString()
  }
}];
```

### 3. OpenAI/IA: validar e enriquecer

Node: `OpenAI` ou `AI Agent`

Objetivo: transformar evento cru em JSON canônico. Use o retorno estruturado abaixo.

System prompt:

```text
Você normaliza eventos de contato para disparo de rotinas. Responda somente JSON válido.
Não invente IDs. Se não houver id, deixe string vazia.
Gatilhos permitidos: manual, tag, status, birthday, specific_date.
Retorne:
{
  "shouldTrigger": boolean,
  "trigger": "tag|status|birthday|manual|specific_date",
  "targetId": string,
  "targetLabel": string,
  "reason": string
}

Regras:
- tag_added dispara trigger tag apenas para tag nova.
- status_changed dispara trigger status apenas quando o status mudou.
- birthday dispara trigger birthday.
- contato que já tinha a tag antes não deve disparar.
```

User message:

```text
Evento normalizado:
{{ JSON.stringify($json) }}
```

### 4. Code: unir IA + evento

Node: `Code`

```js
const event = $('normalizar evento').first().json;
const aiRaw = $json.output || $json.text || $json.message?.content || $json;
const ai = typeof aiRaw === 'string' ? JSON.parse(aiRaw) : aiRaw;

if (ai.shouldTrigger === false) {
  return [];
}

return [{
  json: {
    ...event,
    trigger: ai.trigger || event.trigger,
    targetId: ai.targetId || event.targetId,
    targetLabel: ai.targetLabel || event.targetLabel,
    aiReason: ai.reason || ''
  }
}];
```

### 5. HTTP Request: chamar backend

Node: `HTTP Request`

- Method: `POST`
- URL: `={{ $env.APP_BASE_URL }}/api/routines/trigger`
- Send Headers: true
- Header:
  - `Authorization`: `={{ "Bearer " + $env.ROUTINES_WEBHOOK_SECRET }}`
- Body Content Type: JSON
- Body:

```json
{
  "trigger": "={{ $json.trigger }}",
  "targetId": "={{ $json.targetId }}",
  "targetLabel": "={{ $json.targetLabel }}",
  "contactId": "={{ $json.contactId }}",
  "contactAirtableId": "={{ $json.contactAirtableId }}",
  "chatId": "={{ $json.chatId }}",
  "contactName": "={{ $json.contactName }}",
  "contactPhone": "={{ $json.contactPhone }}",
  "occurredAt": "={{ $json.occurredAt }}",
  "aiReason": "={{ $json.aiReason }}"
}
```

### 6. Respond to Webhook

Node: `Respond to Webhook`

- Response Code: `200`
- Body:

```json
{
  "ok": true,
  "result": "={{ $json }}"
}
```

## Workflow 2: Processar ações pendentes

### 1. Schedule Trigger

Node: `Schedule Trigger`

- Interval: every minute

### 2. HTTP Request

- Method: `POST`
- URL: `={{ $env.APP_BASE_URL }}/api/routines/due`
- Header:
  - `Authorization`: `={{ "Bearer " + $env.ROUTINES_WEBHOOK_SECRET }}`
- Body:

```json
{
  "limit": 50
}
```

## Como disparar quando tag/status mudar

O ideal é o n8n receber do lugar onde a alteração acontece.

Opção preferida:

1. Quando o app salvar uma tag/status, chamar o webhook `contact-routine-event`.
2. Se tag foi adicionada, enviar `event_type = tag_added`.
3. Se status mudou, enviar `event_type = status_changed`.
4. Enviar sempre `previous` e `current` para a IA confirmar que é evento novo.

Opção alternativa:

1. n8n roda a cada minuto.
2. Busca contatos atualizados recentemente.
3. Compara com uma tabela/estado anterior.
4. Gera `tag_added` ou `status_changed`.

Essa alternativa é mais trabalhosa e mais sujeita a duplicidade.
