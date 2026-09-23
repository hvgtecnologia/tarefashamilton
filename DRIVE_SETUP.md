# Meu Drive

Seu drive dentro do Planner: pastas, subpastas e arquivos. Você compartilha **a pasta inteira** por um link (quem recebe vê e baixa tudo que está dentro, sem login) ou **um arquivo isolado**. Toda pasta tem prazo de validade: quando vence, a pasta e tudo dentro dela são apagados de verdade.

---

## Como usar

1. No menu lateral, clique em **Meu Drive**.
2. **Nova pasta** → dê o nome e escolha a validade (padrão: 30 dias).
3. Entre na pasta e clique em **Enviar arquivos**. Cada arquivo pode ter validade própria, mais curta que a da pasta.
4. Na linha da pasta, clique em **Link** para copiar. Mande esse link para quem quiser: ele abre uma página com a lista dos arquivos e um botão de baixar em cada um.
5. Para mudar um prazo depois, clique no seletor de tempo (o relógio) da pasta ou do arquivo.

**A validade manda em cascata.** Se a pasta vence, nada dentro dela abre, mesmo que um arquivo tenha prazo maior. O mesmo vale para subpastas.

---

## Para automação (Claude, n8n, scripts)

O mesmo link aceita `?format=json` e devolve a lista pronta para ser consumida por um robô:

```
https://<seu-project-ref>.functions.supabase.co/drive-share?t=<token>&format=json
```

Resposta: nome da pasta, validade e, para cada arquivo, nome, tamanho, tipo, subpasta e uma URL de download temporária (1 hora).

---

## Configuração (uma vez só)

### 1. Rodar a migração

No **SQL Editor** do Supabase, rode o conteúdo de `migration-v7-drive.sql`. Cria as tabelas, o bucket `drive` (privado) e as regras de acesso. Pode rodar mais de uma vez.

### 2. Publicar as duas Edge Functions

```bash
supabase functions deploy drive-share --no-verify-jwt
supabase functions deploy drive-purge --no-verify-jwt
```

- **drive-share**: a página pública. Confere a validade e emite um link de download assinado, válido por 1 hora.
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

## Por que o bucket é privado

Se o bucket fosse público, qualquer um que tivesse guardado a URL crua do arquivo continuaria baixando depois do vencimento, até a limpeza rodar. Com o bucket privado, a única porta é a página `drive-share`, que confere a validade **antes** de emitir cada link de download. Vencido é vencido na hora; a limpeza só libera o espaço.

---

## Atenção ao consumo

Link público significa download, e download consome a cota de tráfego do seu projeto Supabase — foi o que estourou a conta em setembro. A tela do Drive mostra no topo quanto espaço você já está usando. Vídeos e pastas grandes compartilhadas com muita gente são o que pesa. Se for compartilhar algo grande com muitas pessoas, prefira prazos curtos.
