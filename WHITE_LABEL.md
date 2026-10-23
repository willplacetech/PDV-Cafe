# White-label — checklist (P0–P4)

Branch de referência: **`Generico`**.

## P0 — funcionar sem marca de cliente

- [ ] `Dashboard.jsx` completo no GitHub (sem PLACEHOLDER / sem marca antiga)
- [ ] `npm --prefix front-end run build` OK ou deploy Render verde
- [ ] Login / sidebar / tema dark-light OK
- [ ] Cupom ou relatório de teste com nome **PDV** (ou branding do servidor)
- [ ] Limpar `localStorage` de impressão se necessário: `pdv_config_impressao`

## P1 — apresentação

- [x] README e `.env.example` neutros
- [x] `render.yaml` com branch `Generico`
- [x] PWA `manifest` / `index.html` com PDV + `logo.svg`
- [ ] Serviço Render com branch `Generico` e URLs sem domínio de cliente

## P2 — branding configurável (build + local)

- [x] Plugin Vite injeta title/theme/manifest no build (`VITE_APP_*`)
- [x] `/configuracoes/aparencia`
- [x] Impressão usa `branding.name`

## P3 — higiene

- [x] `package.json` raiz neutro (`pdv`)
- [x] CORS/`sessionOrigins` só via `FRONTEND_URL` + `CORS_EXTRA_ORIGINS`
- [ ] `npm run audit:front` / `audit:back`
- [ ] Smoke demo

## P4 — branding no servidor (multi-dispositivo)

- [x] Modelo `Configuracoes.branding`
- [x] `GET /api/configuracoes/branding` (público)
- [x] `PUT /api/configuracoes/branding` (admin)
- [x] Front: `fetchServerBranding` no boot; Aparência grava no servidor
- [x] Prioridade: override local → servidor → `VITE_APP_*`

### Como testar P4

1. Admin → **Configurações → Aparência** → alterar nome/cor → **Salvar no servidor**.
2. Outro navegador / anônimo → mesmo front → marca igual.
3. `GET /api/configuracoes/branding` retorna o JSON gravado.

### Smoke demo

1. URL do front → login com marca (servidor ou build).
2. Tema claro/escuro.
3. Aparência: salvar no servidor; validar em outro dispositivo.
4. Cupom de teste.
5. Sem assets `Abraco*.png`.

### Variáveis (Render)

```text
FRONTEND_URL=https://seu-front.onrender.com
VITE_APP_NAME=PDV
VITE_APP_THEME_COLOR=#4f9d6a
VITE_API_URL=https://sua-api.onrender.com/api
```
