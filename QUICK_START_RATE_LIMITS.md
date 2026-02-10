# ⚡ Quick Start - Editando Rate Limits

## 🎯 TL;DR

Rate limits agora são **100% configuráveis via `.env`**! 

Edite `.env.local` (desenvolvimento) ou adicione no Cloudflare Dashboard (produção).

---

## 🚀 Como Editar

### Desenvolvimento (`.env.local`)

```bash
# Login: 10 tentativas em 5 minutos (mais permissivo para dev)
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_LOGIN_WINDOW_MIN=5

# Register: 10 registros em 10 minutos
RATE_LIMIT_REGISTER_MAX=10
RATE_LIMIT_REGISTER_WINDOW_MIN=10

# Upload: 100 uploads em 10 minutos
RATE_LIMIT_UPLOAD_MAX=100
RATE_LIMIT_UPLOAD_WINDOW_MIN=10
```

**Reinicie o servidor:**
```bash
npm run dev
```

### Produção (Cloudflare Dashboard)

1. **Cloudflare Dashboard** → Workers & Pages
2. Selecione seu worker
3. **Settings** → **Variables and Secrets**
4. Clique **Add variable**
5. Adicione:
   ```
   RATE_LIMIT_LOGIN_MAX = 5
   RATE_LIMIT_LOGIN_WINDOW_MIN = 15
   ```
6. **Save and deploy**

---

## 📋 Variáveis Disponíveis

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `RATE_LIMIT_LOGIN_MAX` | Max tentativas de login | `5` |
| `RATE_LIMIT_LOGIN_WINDOW_MIN` | Janela em minutos | `15` |
| `RATE_LIMIT_REGISTER_MAX` | Max registros | `3` |
| `RATE_LIMIT_REGISTER_WINDOW_MIN` | Janela em minutos | `60` |
| `RATE_LIMIT_UPLOAD_MAX` | Max uploads | `20` |
| `RATE_LIMIT_UPLOAD_WINDOW_MIN` | Janela em minutos | `60` |
| `RATE_LIMIT_API_MAX` | Max req API geral | `100` |
| `RATE_LIMIT_API_WINDOW_MIN` | Janela em minutos | `1` |

---

## 💡 Exemplos Práticos

### Desenvolvimento Local - Bem Permissivo
```bash
# .env.local
RATE_LIMIT_LOGIN_MAX=20
RATE_LIMIT_LOGIN_WINDOW_MIN=5
RATE_LIMIT_UPLOAD_MAX=100
```

### Produção - Seguro (Padrão)
```bash
# Se estiver ok com os padrões, não precisa definir nada!
# Mas se quiser customizar:
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MIN=15
RATE_LIMIT_UPLOAD_MAX=20
```

### Produção - Alta Segurança
```bash
RATE_LIMIT_LOGIN_MAX=3
RATE_LIMIT_LOGIN_WINDOW_MIN=30
RATE_LIMIT_REGISTER_MAX=1
RATE_LIMIT_REGISTER_WINDOW_MIN=120
```

---

## ✅ Verificar se Está Funcionando

### Teste no terminal:
```bash
# Fazer 6 tentativas de login (padrão bloqueia na 6ª)
for i in {1..6}; do
  echo "Tentativa $i"
  curl -L -X POST http://localhost:8788/api/login \
    -d "email=test@test.com&password=wrong"
done
```

**Esperado:** 6ª tentativa redireciona com `error=rate_limit_exceeded`

---

## 🔧 Troubleshooting

### "Mudei o .env mas não funcionou"

**Solução:** Reinicie o dev server:
```bash
# Ctrl+C para parar
npm run dev
```

### "Não quero rate limit em dev"

**Solução:** Use valores muito altos:
```bash
RATE_LIMIT_LOGIN_MAX=1000
RATE_LIMIT_LOGIN_WINDOW_MIN=1
```

### "Quero desabilitar completamente"

**Solução:** Use `0`:
```bash
RATE_LIMIT_LOGIN_MAX=0  # Desabilita rate limit de login
```

---

## 📚 Documentação Completa

Para detalhes completos, exemplos por ambiente, e best practices:

👉 **[RATE_LIMIT_CONFIG.md](./RATE_LIMIT_CONFIG.md)**

---

*Rate Limits agora são 100% configuráveis!* ⚙️✨
