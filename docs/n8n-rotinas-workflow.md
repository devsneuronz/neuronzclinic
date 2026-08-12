# Workflow n8n para Rotinas

O n8n recebe e normaliza eventos; o backend avalia grupos `E/OU`, classifica intenções de mensagem e cria a fila no Supabase.

## Ordem de implantação

1. Execute `docs/supabase-routines-runtime-hardening.sql`, `docs/supabase-routines-ai-reply-control.sql` e `docs/supabase-routines-execution-controls.sql` no Supabase.
2. Publique o backend com os endpoints atualizados.
3. Importe `docs/n8n-rotinas-event-workflow.json`, `docs/n8n-rotinas-due-workflow.json` e, para gatilhos com IA, `docs/n8n-rotinas-ai-classifier-workflow.json`.
4. Configure no n8n `APP_BASE_URL`, `ROUTINES_WEBHOOK_SECRET`, `OPENAI_API_KEY` e opcionalmente `OPENAI_ROUTINES_MODEL`.
5. Configure no app `ROUTINES_WEBHOOK_SECRET` e `ROUTINES_EVENT_WEBHOOK_URL`.
6. Teste eventos com `dryRun: true` antes de liberar ações reais.

## Posição no fluxo de recebimento

Depois de persistir a mensagem e criar/atualizar o chat, o fluxo de mensagens segue para o buffer de concatenação. Quando o buffer fechar, avalie as rotinas antes de chamar a IA de atendimento:

```text
texto concatenado -> webhook contact-routine-event -> suppressAiReply?
                                                    -> false: IA de atendimento
                                                    -> true: encerrar sem chamar a IA
```

No n8n que chamou o webhook, adicione um `IF` com `={{ $json.suppressAiReply === true }}`. A saída `true` encerra o fluxo; a saída `false` segue para a IA. Não execute esses dois caminhos em paralelo, pois isso permitiria respostas duplicadas.

Não use um Merge configurado para aguardar todas as ramificações de mídia, porque apenas uma delas executa para cada mensagem. Todas as pontas de texto, imagem, áudio e documento devem chamar o mesmo subworkflow de concatenação.

## Evento de mensagem concatenada

```json
{
  "event_id": "message-batch:<chat_id>:<processing_token>",
  "event_type": "message_received",
  "occurred_at": "<ISO da última mensagem>",
  "contact_id": "<contact_id>",
  "chat_id": "<chat_id>",
  "message_id": "<id da última mensagem>",
  "message_text": "<texto concatenado>",
  "source": "message-debounce"
}
```

O `processing_token` do buffer é apropriado para o `event_id`: permanece estável durante retries e muda no próximo lote de mensagens.

## Eventos de tag e status

Envie `tag_added` ou `status_changed` imediatamente depois de persistir a mudança. A ação de rotina `add_tag` também publica `tag_added`, permitindo encadeamento entre rotinas.

Cada evento precisa de um `event_id` estável. O workflow importável preserva `event_id`/`eventId` quando informado e cria um fallback a partir do evento, alvo e horário.

## Processamento das ações

O workflow `Neuronz - Rotinas - Processar Pendências` continua chamando, a cada minuto:

```text
POST $APP_BASE_URL/api/routines/due
Authorization: Bearer $ROUTINES_WEBHOOK_SECRET
```

```json
{
  "limit": 50
}
```

O endpoint agora reserva ações atomicamente. Execuções simultâneas do workflow não recebem a mesma ação. Falhas temporárias são reagendadas após 1, 5 e 15 minutos; ao esgotar as tentativas, a execução é marcada como falha e as ações seguintes são canceladas.

Para rotinas sem o gatilho `Mensagem específica`, o horário configurado é o início da sequência de ações. Eventos recebidos depois desse horário ficam para o próximo dia. O máximo de execuções vale por contato e é aplicado de forma atômica no banco, evitando novos disparos quando o limite for alcançado.

## Segurança

- Use somente a Production URL do webhook publicado.
- Não coloque o segredo na query string.
- `ROUTINES_WEBHOOK_SECRET` é obrigatório para chamadas externas.
- O n8n não escolhe tabela, função SQL ou URL arbitrária a partir da saída da IA.
- O classificador de intenção fica em `ROUTINES_AI_CLASSIFIER_WEBHOOK_URL`; o workflow de eventos não precisa de uma segunda IA de normalização.

## Classificador `ai_message`

O workflow `Neuronz - Rotinas - Classificador de intenção` publica o webhook `classify-routine-intents`. Configure no app:

```env
ROUTINES_AI_CLASSIFIER_WEBHOOK_URL=https://seu-n8n/webhook/classify-routine-intents
```

No n8n:

```env
OPENAI_API_KEY=chave_gerenciada_no_n8n
OPENAI_ROUTINES_MODEL=gpt-5.6-luna
ROUTINES_WEBHOOK_SECRET=o_mesmo_segredo_do_app
```

O modelo recebe todas as condições `ai_message` elegíveis em uma única chamada. O workflow valida IDs, limites e autenticação antes da OpenAI, usa saída JSON estruturada e inicializa como `false` qualquer condição ausente ou desconhecida.
