# Eventos de automação no n8n

Envie os eventos para `POST /api/routines/events` com o header `x-routines-secret` contendo o mesmo valor de `ROUTINES_WEBHOOK_SECRET`.

## Mensagem recebida

Para gatilhos de texto/IA, envie o evento depois que o buffer de mensagens for fechado. Assim, frases divididas em várias mensagens são avaliadas como uma única intenção.

O retorno inclui `suppressAiReply`. Antes de chamar a IA de atendimento, verifique se esse campo é `false`. Ele será `true` quando uma rotina correspondente tiver uma ação `send_message` configurada para impedir a resposta automática da IA. O bloqueio é mantido em retries duplicados do mesmo `eventId`.

```json
{
  "eventId": "message:{{ $json.message_id }}",
  "eventType": "message_received",
  "occurredAt": "{{ $now.toISO() }}",
  "contactId": "{{ $json.contact_id }}",
  "chatId": "{{ $json.chat_id }}",
  "messageId": "{{ $json.message_id }}",
  "messageText": "{{ $json.content }}"
}
```

Use `"dryRun": true` durante os testes. O avaliador retorna as condições verificadas, mas não cria `routine_runs` nem `routine_action_runs`.

## Outros eventos

- Tag adicionada: `tag_added`, com `tagId` e `tagLabel`.
- Status alterado: `status_changed`, com `status` e `previousStatus`.
- Data específica: `specific_date`, com `occurredAt` no dia que deve ser avaliado.
- Aniversário: `birthday`, emitido pelo workflow diário para cada contato elegível.
- Manual: continua compatível com `/api/routines/trigger`; o novo endpoint também aceita `manual` com `routineId`.

O evento deve ser emitido depois que o chat for atualizado no Supabase. Assim, condições de estado como tag e status são avaliadas contra os dados mais recentes.

## Classificador de IA

Configure `ROUTINES_AI_CLASSIFIER_WEBHOOK_URL` com um webhook separado do n8n. O backend envia uma única requisição por mensagem:

O workflow importável está em `docs/n8n-rotinas-ai-classifier-workflow.json`. Ele requer `OPENAI_API_KEY`, `ROUTINES_WEBHOOK_SECRET` e aceita `OPENAI_ROUTINES_MODEL` opcional, usando `gpt-5.6-luna` por padrão.

```json
{
  "message": "Quero marcar uma avaliação",
  "conditions": [
    {
      "id": "uuid-da-condicao",
      "intent": "Paciente demonstra interesse em agendar uma avaliação"
    }
  ]
}
```

O webhook deve responder em um destes formatos:

```json
{
  "matches": {
    "uuid-da-condicao": true
  }
}
```

ou:

```json
{
  "matches": [
    {
      "conditionId": "uuid-da-condicao",
      "matched": true
    }
  ]
}
```

Se o classificador falhar, as condições de IA são consideradas falsas e as demais rotinas continuam sendo avaliadas.

## Idempotência

`eventId` deve ser estável e único na origem. Para mensagens, use o ID da mensagem; para eventos diários, use chaves como `birthday:<contactId>:2026` ou `date:<contactId>:2026-12-25`.

Para mensagens concatenadas, prefira `message-batch:<chatId>:<processingToken>`. Não use o ID da execução do n8n, pois ele muda a cada retry.

## Encadeamento

A ação `add_tag` publica um novo `tag_added` no `ROUTINES_EVENT_WEBHOOK_URL`. O evento derivado preserva a correlação original e combina essa correlação com a tag na chave de idempotência. Assim, uma rotina pode iniciar outra, mas um ciclo que tente adicionar novamente a mesma tag na mesma cadeia é interrompido.
