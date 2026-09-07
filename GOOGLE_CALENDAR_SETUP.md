# Integração com Google Agenda (Feed iCal)

Sua aplicação agora possui integração completa com o **Google Agenda**, **Apple Calendar** e **Outlook** através do formato padrão **iCalendar (.ics)**.

---

## 🚀 Como funciona

1. **Na Interface do Planner:**
   - Acesse o menu lateral e clique em **Google Agenda**.
   - Você verá o seu **Link Pessoal de Assinatura** exclusivo.

2. **No Google Agenda (No Computador):**
   - Acesse o [Google Agenda Web](https://calendar.google.com).
   - Na barra lateral esquerda, ao lado de **"Outras agendas"**, clique no ícone de **+** e selecione **"Do URL"** (ou use o botão direto do modal).
   - Cole o seu Link de Assinatura e clique em **Adicionar agenda**.

---

## ⚡ Ativando a Sincronização em Tempo Real no Supabase

A Edge Function já foi criada em `supabase/functions/calendar-feed/index.ts`. Para publicá-la no seu projeto Supabase:

1. No terminal, execute o deploy:
```bash
npx supabase functions deploy calendar-feed --no-verify-jwt
```

2. Pronto! O Google Agenda irá buscar os eventos diretamente do seu Supabase de forma contínua e automática.

---

## 📥 Importação Manual (.ics)
Se preferir não usar URL pública, você também pode clicar no botão **"Baixar .ics"** dentro do modal no Planner e importar o arquivo `.ics` diretamente no seu app de calendário preferido.
