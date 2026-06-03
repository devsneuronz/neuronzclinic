# Ajustes para Rotinas Enviarem Mensagens

Hoje o fluxo de rotinas já consegue processar uma ação do tipo `Enviar Mensagem`, mas ainda precisa de alguns ajustes antes de usar em produção.

## Situação Atual

Quando uma ação pendente tem:

```text
action_type = send_message
```

o backend chama o webhook:

```env
SEND_MESSAGE_WEBHOOK_URL
```

e tenta montar o texto da mensagem usando esta ordem:

```text
1. action.message
2. action.subject
3. action.templateLabel
```

O problema: `templateLabel` normalmente é apenas o nome do template, não o conteúdo completo da mensagem.

Então, se a rotina usar um template chamado `Aniversariantes - Minoxidil`, o backend pode acabar enviando literalmente:

```text
Aniversariantes - Minoxidil
```

em vez do texto real do template.

## O Que Precisa Ajustar

### 1. Identificar a tabela de templates no Airtable

Na tabela `Processos`, o campo:

```text
Template_mensagem
```

é um link para a tabela de templates.

Precisamos confirmar:

```text
ID da tabela de templates
Nome do campo que contém o texto da mensagem
Nome do campo de tipo/categoria, se necessário
Nome do campo de status ativo/inativo, se existir
```

Exemplo esperado:

```text
Tabela: Template de mensagens
Campo nome: Template
Campo texto: Mensagem ou Conteúdo
Campo tipo: Tipo_mensagem
```

### 2. Backend deve buscar o template pelo record id

Hoje o payload da ação salva:

```json
{
  "templateId": "recXXXXXXXXXXXXXX",
  "templateLabel": "Nome do template"
}
```

O backend deve usar `templateId` para buscar o registro real no Airtable.

Fluxo esperado:

```text
routine_action_runs.payload.templateId
-> buscar template no Airtable
-> pegar texto completo
-> montar mensagem final
-> enviar webhook
```

### 3. Criar função de resolução de template

No backend, em:

```text
app/api/routines/due/route.ts
```

criar algo como:

```ts
async function resolveMessageText(run, action) {
  if (action.message) return action.message

  if (action.templateId) {
    const template = await fetchTemplate(action.templateId)
    return renderTemplate(template.content, run)
  }

  if (action.subject) return action.subject

  throw new Error("A ação de mensagem precisa de texto/template.")
}
```

### 4. Substituir variáveis do template

O template pode ter variáveis como:

```text
{{nome}}
{{nome_contato}}
{{telefone}}
{{data}}
{{primeiro_nome}}
```

O backend deve substituir usando dados do `routine_runs`:

```text
contact_name
contact_phone
chat_id
payload
```

Sugestão inicial:

```text
{{nome}} -> contact_name
{{nome_contato}} -> contact_name
{{primeiro_nome}} -> primeira palavra de contact_name
{{telefone}} -> contact_phone
{{chat_id}} -> chat_id
```

### 5. Evitar envio acidental em teste

Antes de ativar mensagens reais:

```text
1. Criar uma rotina TESTE
2. Usar contato próprio
3. Usar template com texto claro: "TESTE ROTINA - ignore"
4. Deixar intervalo de 1 minuto
5. Rodar o workflow due manualmente
6. Conferir se a mensagem chegou corretamente
```

### 6. Registrar resultado do envio

O endpoint `/api/routines/due` já salva `result` em `routine_action_runs`.

Para mensagens, o ideal é gravar:

```json
{
  "type": "send_message",
  "chatId": "...",
  "textPreview": "primeiros 120 caracteres",
  "webhookStatus": 200,
  "webhookResponse": {}
}
```

Assim fica fácil auditar.

## Ajustes Recomendados no Airtable

Na tabela `Processos`, para ações `Enviar Mensagem`, garantir que:

```text
Tipo = Enviar Mensagem
Template_mensagem = template vinculado
Intervalo = Minutos/Horas/Dias/Nenhum
numero = quantidade do intervalo
ordem = ordem da ação
```

Evitar depender de:

```text
Assunto
Descrição
Template
```

para o texto final da mensagem.

Esses campos podem ajudar visualmente, mas o envio real deve vir do registro vinculado em `Template_mensagem`.

## Ajustes Recomendados no Front

Na tela de rotinas:

```text
1. Quando Tipo = Enviar Mensagem, mostrar seletor de Template_mensagem.
2. Impedir salvar Enviar Mensagem sem template.
3. Mostrar uma prévia do template, se possível.
4. Manter o campo Assunto só para ações de tarefa/aviso.
```

Hoje o backend já bloqueia salvar `Enviar Mensagem` sem `templateId`, mas o front ainda não tem seletor de template.

## Checklist de Implementação

```text
[ ] Descobrir ID da tabela de templates
[ ] Descobrir campo de texto do template
[ ] Criar API para listar templates no front
[ ] Adicionar seletor de template na ação Enviar Mensagem
[ ] Buscar conteúdo do template no backend due
[ ] Renderizar variáveis
[ ] Enviar mensagem final pelo SEND_MESSAGE_WEBHOOK_URL
[ ] Salvar preview/resultado em routine_action_runs.result
[ ] Testar com contato próprio
```

## Ordem Recomendada

1. Primeiro ajustar backend para buscar template real.
2. Depois ajustar front para selecionar template.
3. Depois testar com uma rotina de mensagem isolada.
4. Só depois ativar em produção.
