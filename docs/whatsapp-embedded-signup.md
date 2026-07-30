# Conectar WhatsApp de novas lojas (Embedded Signup)

O Zivo conecta o WhatsApp de cada loja pela **Cloud API oficial da Meta**, no
modelo *Tech Provider*: cada loja usa a **WABA dela** (e paga a Meta dela),
mas o onboarding acontece **dentro do Zivo**, sem o dono mexer no painel de
desenvolvedor. Ao conectar, o Zivo:

1. troca o `code` do popup por um token de acesso;
2. registra o número na Cloud API;
3. assina o app do Zivo nos webhooks da WABA;
4. **clona os templates já aprovados** da WABA-fonte pra WABA nova;
5. salva as credenciais em `loja_config` (`whatsapp_provider='meta'`).

## Variáveis de ambiente (Vercel)

| Variável | Onde usar | O que é |
|---|---|---|
| `NEXT_PUBLIC_META_APP_ID` | client | App ID do app Meta do Zivo (público) |
| `NEXT_PUBLIC_META_CONFIG_ID` | client | Configuration ID do Embedded Signup (WhatsApp) |
| `META_APP_ID` | server | Mesmo App ID (troca do code por token) |
| `META_APP_SECRET` | server | App Secret do app Meta do Zivo |
| `META_WABA_ID` | server | WABA-fonte (a sua, com os templates aprovados) |
| `META_ACCESS_TOKEN` | server | Token que lê os templates da WABA-fonte (já existe) |
| `META_API_VERSION` | server | Opcional, default `v21.0` |

> Sem `NEXT_PUBLIC_META_APP_ID` + `NEXT_PUBLIC_META_CONFIG_ID`, o botão de
> conexão automática fica oculto e só aparece a **conexão manual** (colar
> Phone Number ID + WABA + token). Ambos os caminhos funcionam.

## Pré-requisitos na Meta (não são código — levam alguns dias)

1. **Verificação de negócio** da empresa (Zivo) no Business Manager.
2. **Acesso avançado** às permissões `whatsapp_business_messaging` e
   `whatsapp_business_management`.
3. **App Review** liberando o Embedded Signup em produção.
4. Criar a **Configuration** do Embedded Signup (gera o `CONFIG_ID`).
5. Configurar o **webhook do app** apontando pra
   `https://<dominio>/api/whatsapp/webhook` com o verify token.

Enquanto isso não sai, dá pra usar a **conexão manual** + botão
**"Provisionar templates"** (clona os modelos aprovados pra qualquer WABA já
conectada) — funciona sem esperar aprovação.

## Endpoints

- `POST /api/whatsapp/meta/embedded-signup` — finaliza o Embedded Signup.
- `POST /api/whatsapp/meta/provisionar-templates` — clona os templates pra
  WABA da loja logada (conexão manual).
- `POST /api/whatsapp/meta/testar` — valida Phone Number ID + token.
