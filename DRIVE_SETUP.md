# Meu Drive

Seu drive dentro do Planner: pastas, subpastas e arquivos. Você compartilha **a pasta inteira** por um link (quem recebe vê e baixa tudo que está dentro, sem login) ou **um arquivo isolado**. Toda pasta tem prazo de validade: quando vence, a pasta e tudo dentro dela são apagados de verdade.

---

## Como usar

1. No menu lateral, clique em **Meu Drive**.
2. **Nova pasta** → dê o nome e escolha a validade (padrão: 30 dias).
3. Entre na pasta e clique em **Enviar arquivos**. Cada arquivo pode ter validade própria, mais curta que a da pasta.
4. Na linha da pasta, clique em **Link** para copiar. O link é do **seu próprio site** (algo como `https://seusite.com/#/s/abc123`), e abre uma página com a lista dos arquivos e um botão de baixar em cada um.
5. Para mudar um prazo depois, clique no seletor de tempo (o relógio) da pasta ou do arquivo.

**A validade manda em cascata.** Se a pasta vence, nada dentro dela abre, mesmo que um arquivo tenha prazo maior. O mesmo vale para subpastas.

---

## Anexar Drive numa tarefa

Dentro de uma tarefa (tanto no **Adicionar rápido** quanto na edição) existe a seção **Do Meu Drive** → *Anexar pasta ou arquivo*. Escolha a pasta ou o arquivo e ele passa a aparecer na tarefa.

Quando você delega essa tarefa para alguém da equipe, a pessoa vê o mesmo material em **Material do Drive** e abre pelo link público — ela não precisa de acesso ao seu Drive.

**Prefira anexar a pasta, não o arquivo.** O que você colocar na pasta depois aparece sozinho para quem já recebeu a tarefa; anexando um arquivo, você teria que anexar cada novo arquivo na mão.

Duas coisas para ter em mente:

- **A validade continua valendo.** Se a pasta anexada vencer, o link da tarefa para de abrir. Para material que a equipe vai consultar por muito tempo, dê um prazo longo ou deixe sem validade.
- **Só você mexe nisso.** O membro abre e baixa, mas não consegue tirar nem trocar o que está anexado — o banco bloqueia essa coluna para ele.

---

## Para automação (Claude, n8n, scripts)

Por trás da página existe uma API que devolve tudo em JSON. Basta trocar o endereço do site pelo da função, usando o mesmo código do link:

```
https://<seu-project-ref>.functions.supabase.co/drive-share?t=<token>
```

Resposta: nome da pasta, validade e, para cada arquivo, nome, tamanho, tipo, subpasta e uma URL de download temporária (1 hora).

---

## Configuração (uma vez só)

### 1. Rodar a migração

No **SQL Editor** do Supabase, rode o conteúdo de `migration-v7-drive.sql`. Cria as tabelas, o bucket `drive` (privado) e as regras de acesso. Pode rodar mais de uma vez.

Em seguida rode `migration-v8-tarefa-drive.sql`, que é o que permite anexar pasta/arquivo numa tarefa. Também pode rodar mais de uma vez.

### 2. Publicar as duas Edge Functions

```bash
supabase functions deploy drive-share --no-verify-jwt
supabase functions deploy drive-purge --no-verify-jwt
```

- **drive-share**: a API do compartilhamento. Confere a validade e emite os links de download assinados (1 hora). A página em si é desenhada pelo app, na rota `#/s/<token>`.
- **drive-purge**: apaga de verdade (Storage + banco) pastas e arquivos vencidos.

`--no-verify-jwt` é obrigatório nas duas: quem abre o link não tem login.

### 3. Agendar a limpeza automática

No painel do Supabase: **Database → Cron Jobs → Create a new cron job**.

- **Name**: `drive-purge`
- **Schedule**: `0 * * * *` (de hora em hora)
- **Type**: HTTP Request · **Method**: POST
- **URL**: `https://<seu-project-ref>.functions.supabase.co/drive-purge`

Se preferir rodar na mão: `curl -X POST https://<seu-project-ref>.functions.supabase.co/drive-purge`.

---

## Duas decisões de arquitetura

**O bucket é privado.** Se fosse público, quem tivesse guardado o endereço cru do arquivo continuaria baixando depois do vencimento, até a limpeza rodar. Privado, a única porta é a `drive-share`, que confere a validade **antes** de emitir cada link. Vencido é vencido na hora; a limpeza só libera o espaço.

**A página fica no app, não na Edge Function.** O Supabase força `text/plain` em qualquer HTML servido por Edge Function (proteção antiphishing do domínio `*.supabase.co`), então uma página montada lá chega como texto cru no navegador. Além de resolver isso, o link fica no seu domínio, o que passa muito mais confiança para quem recebe.

---

## Atenção ao consumo

Link público significa download, e download consome a cota de tráfego do seu projeto Supabase — foi o que estourou a conta em setembro. A tela do Drive mostra no topo quanto espaço você já está usando. Vídeos e pastas grandes compartilhadas com muita gente são o que pesa. Se for compartilhar algo grande com muitas pessoas, prefira prazos curtos.
