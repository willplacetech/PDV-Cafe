# White-label — checklist (P0–P3)

Branch de referência: **`Generico`**.

## P0 — funcionar sem marca de cliente

- [ ] `Dashboard.jsx` completo no GitHub (sem PLACEHOLDER / sem marca antiga)
- [ ] `npm --prefix front-end run build` OK ou deploy Render verde
- [ ] Login / sidebar / tema dark-light OK
- [ ] Cupom ou relatório de teste com nome **PDV** (ou `VITE_APP_NAME`)
- [ ] Limpar `localStorage` de impressão se necessário: `pdv_config_impressao`

## P1 — apresentação

- [x] README e `.env.example` neutros
- [x] `render.yaml` com branch `Generico`
- [x] PWA `manifest` / `index.html` com PDV + `logo.svg`
- [ ] Serviço Render com branch `Generico` e URLs sem domínio de cliente
- [ ] (Opcional) PNG 192/512 em `public/`

## P2 — branding configurável

- [x] Plugin Vite injeta title/theme/manifest no build (`VITE_APP_*`)
- [x] `/configuracoes/aparencia` (override local)
- [x] Impressão usa `branding.name`

## P3 — higiene

- [x] `package.json` raiz neutro (`pdv`)
- [x] CORS/`sessionOrigins` só via `FRONTEND_URL` + `CORS_EXTRA_ORIGINS`
- [ ] `npm run audit:front` / `audit:back` e corrigir highs (`audit:fix:front` com cuidado)
- [ ] Smoke demo (abaixo)

### Smoke demo (5–10 min)

1. Abrir URL do front (não `sabordabraco` em produção de demo).
2. Login → logo + nome PDV.
3. Alternar tema.
4. PDV: listar produtos.
5. Configurações → Aparência: mudar nome e cor; salvar; conferir sidebar.
6. Impressoras: teste de cupom com o nome atual.
7. DevTools → Application: sem assets `Abraco*.png`.

### Variáveis úteis (Render)

```text
FRONTEND_URL=https://seu-front.onrender.com
CORS_EXTRA_ORIGINS=
VITE_APP_NAME=PDV
VITE_APP_THEME_COLOR=#4f9d6a
VITE_API_URL=https://sua-api.onrender.com/api
```

### Audit (local)

```bash
npm run audit:front
npm run audit:back
# só se aceitável quebrar lockfile em demo:
npm run audit:fix:front
```
