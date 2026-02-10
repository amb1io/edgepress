# ⚙️ Configuração de Rate Limiting

Os rate limits são **totalmente configuráveis** via variáveis de ambiente, permitindo ajustar os limites sem alterar código ou fazer redeploy.

---

## 📋 Variáveis de Ambiente

### Login Rate Limit

Protege contra brute force de senhas:

```bash
RATE_LIMIT_LOGIN_MAX=5           # Máximo de tentativas
RATE_LIMIT_LOGIN_WINDOW_MIN=15   # Janela em minutos
```

**Padrão:** 5 tentativas em 15 minutos

**Recomendações:**
- **Desenvolvimento:** `10` tentativas / `5` minutos (mais permissivo)
- **Produção:** `5` tentativas / `15` minutos (padrão, seguro)
- **Alta segurança:** `3` tentativas / `30` minutos (mais restritivo)

---

### Register Rate Limit

Previne criação em massa de contas:

```bash
RATE_LIMIT_REGISTER_MAX=3        # Máximo de registros
RATE_LIMIT_REGISTER_WINDOW_MIN=60  # Janela em minutos (1 hora)
```

**Padrão:** 3 registros em 1 hora

**Recomendações:**
- **Desenvolvimento:** `10` registros / `10` minutos
- **Produção:** `3` registros / `60` minutos (padrão)
- **Registro fechado:** `1` registro / `120` minutos

---

### Upload Rate Limit

Protege storage e previne abuse:

```bash
RATE_LIMIT_UPLOAD_MAX=20         # Máximo de uploads
RATE_LIMIT_UPLOAD_WINDOW_MIN=60  # Janela em minutos (1 hora)
```

**Padrão:** 20 uploads em 1 hora

**Recomendações:**
- **Desenvolvimento:** `100` uploads / `10` minutos
- **Produção:** `20` uploads / `60` minutos (padrão)
- **Usuários premium:** `50` uploads / `60` minutos

---

### API Geral Rate Limit

Proteção geral para outros endpoints:

```bash
RATE_LIMIT_API_MAX=100           # Máximo de requisições
RATE_LIMIT_API_WINDOW_MIN=1      # Janela em minutos
```

**Padrão:** 100 requisições por minuto

**Recomendações:**
- **Desenvolvimento:** `1000` req / `1` minuto
- **Produção:** `100` req / `1` minuto (padrão)
- **API pública:** `60` req / `1` minuto

---

## 🚀 Como Configurar

### 1. Desenvolvimento Local

Edite `.env.local` ou `.dev.vars`:

```bash
# .env.local ou .dev.vars
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_LOGIN_WINDOW_MIN=5
RATE_LIMIT_UPLOAD_MAX=100
RATE_LIMIT_UPLOAD_WINDOW_MIN=10
```

### 2. Produção (Cloudflare)

**Opção A: Via Dashboard**
1. Acesse Cloudflare Dashboard → Workers & Pages
2. Selecione seu worker
3. Settings → Variables and Secrets
4. Adicione as variáveis

**Opção B: Via CLI (wrangler)**
```bash
wrangler secret put RATE_LIMIT_LOGIN_MAX
# Digite: 5

wrangler secret put RATE_LIMIT_LOGIN_WINDOW_MIN
# Digite: 15

# Repetir para outras variáveis...
```

**Opção C: Via wrangler.jsonc**
```jsonc
{
  "vars": {
    "RATE_LIMIT_LOGIN_MAX": "5",
    "RATE_LIMIT_LOGIN_WINDOW_MIN": "15",
    "RATE_LIMIT_REGISTER_MAX": "3",
    "RATE_LIMIT_REGISTER_WINDOW_MIN": "60",
    "RATE_LIMIT_UPLOAD_MAX": "20",
    "RATE_LIMIT_UPLOAD_WINDOW_MIN": "60",
    "RATE_LIMIT_API_MAX": "100",
    "RATE_LIMIT_API_WINDOW_MIN": "1"
  }
}
```

---

## 📊 Exemplos de Configuração por Ambiente

### Ambiente de Desenvolvimento

```bash
# Permissivo para facilitar testes
RATE_LIMIT_LOGIN_MAX=20
RATE_LIMIT_LOGIN_WINDOW_MIN=5
RATE_LIMIT_REGISTER_MAX=10
RATE_LIMIT_REGISTER_WINDOW_MIN=10
RATE_LIMIT_UPLOAD_MAX=100
RATE_LIMIT_UPLOAD_WINDOW_MIN=10
RATE_LIMIT_API_MAX=1000
RATE_LIMIT_API_WINDOW_MIN=1
```

### Ambiente de Staging

```bash
# Similar à produção mas um pouco mais permissivo
RATE_LIMIT_LOGIN_MAX=7
RATE_LIMIT_LOGIN_WINDOW_MIN=10
RATE_LIMIT_REGISTER_MAX=5
RATE_LIMIT_REGISTER_WINDOW_MIN=30
RATE_LIMIT_UPLOAD_MAX=30
RATE_LIMIT_UPLOAD_WINDOW_MIN=60
RATE_LIMIT_API_MAX=200
RATE_LIMIT_API_WINDOW_MIN=1
```

### Produção Padrão

```bash
# Valores padrão - não precisa definir se estiver ok
# (Apenas para referência, pode omitir todas)
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MIN=15
RATE_LIMIT_REGISTER_MAX=3
RATE_LIMIT_REGISTER_WINDOW_MIN=60
RATE_LIMIT_UPLOAD_MAX=20
RATE_LIMIT_UPLOAD_WINDOW_MIN=60
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW_MIN=1
```

### Produção Alta Segurança

```bash
# Para ambientes que requerem segurança extra
RATE_LIMIT_LOGIN_MAX=3
RATE_LIMIT_LOGIN_WINDOW_MIN=30
RATE_LIMIT_REGISTER_MAX=1
RATE_LIMIT_REGISTER_WINDOW_MIN=120
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_UPLOAD_WINDOW_MIN=60
RATE_LIMIT_API_MAX=50
RATE_LIMIT_API_WINDOW_MIN=1
```

---

## 🧪 Testando Rate Limits

### Teste Manual - Login

```bash
# Fazer 6 tentativas de login (excede o limite padrão de 5)
for i in {1..6}; do
  echo "Tentativa $i:"
  curl -X POST http://localhost:8788/api/login \
    -d "email=test@test.com&password=wrong" \
    -L
  echo ""
done

# Esperado: 6ª tentativa redireciona com error=rate_limit_exceeded
```

### Teste Manual - Upload

```bash
# Script para testar limite de uploads
for i in {1..25}; do
  echo "Upload $i:"
  curl -X POST http://localhost:8788/api/upload \
    -F "file=@test.jpg" \
    -w "\nStatus: %{http_code}\n"
done

# Esperado: Após 20 uploads, retorna 429 Too Many Requests
```

### Verificar Response Headers

```bash
curl -v -X POST http://localhost:8788/api/login \
  -d "email=test@test.com&password=wrong"

# Headers retornados (após rate limit):
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 2026-02-06T15:30:00.000Z
# Retry-After: 900
```

---

## 🔧 Ajustando Rate Limits em Tempo Real

### Cloudflare Workers

Para Cloudflare Workers, você pode alterar variáveis sem redeploy:

1. Acesse o Dashboard
2. Atualize a variável
3. As mudanças entram em vigor **imediatamente** (próxima requisição)

**Nota:** Mudanças afetam apenas novos workers. Workers em execução mantêm valores antigos até timeout.

### Forçar Reload de Workers

```bash
# Via wrangler
wrangler deploy

# Ou fazer uma mudança trivial e push
echo "# Updated $(date)" >> README.md
git commit -am "Force worker reload"
git push
```

---

## 📈 Monitoramento e Ajustes

### Sinais de que Rate Limits Precisam Ajuste

**Rate limits MUITO BAIXOS:**
- ✅ Usuários legítimos sendo bloqueados
- ✅ Muitas reclamações de "erro ao fazer login"
- ✅ Support tickets sobre bloqueios

**Ação:** Aumentar `MAX` ou `WINDOW_MIN`

**Rate limits MUITO ALTOS:**
- ❌ Muitas tentativas de brute force bem-sucedidas
- ❌ Storage crescendo rapidamente
- ❌ Custo alto com requests

**Ação:** Diminuir `MAX` ou reduzir `WINDOW_MIN`

### Métricas Recomendadas

1. **Taxa de bloqueio:** `blocked_requests / total_requests`
   - Ideal: < 1%
   - Alerta: > 5%

2. **Tentativas por usuário:**
   - Normal: 1-2 tentativas
   - Suspeito: 3+ tentativas

3. **Uploads por hora:**
   - Monitor para spikes anormais

---

## 🎯 Best Practices

### 1. Comece com Valores Padrão

Os valores padrão são seguros para maioria dos casos:
- ✅ Protegem contra brute force
- ✅ Previnem DoS
- ✅ Não impactam usuários legítimos

### 2. Monitore e Ajuste Gradualmente

- Não mude múltiplas variáveis de uma vez
- Monitore por 1-2 dias após mudanças
- Documente razão de cada mudança

### 3. Diferente por Ambiente

- **Dev:** Permissivo (facilita testes)
- **Staging:** Similar à produção
- **Produção:** Valores seguros e testados

### 4. Considere Usuários Premium

Para planos pagos, você pode:
- Criar endpoint separado com limites maiores
- Verificar role do usuário antes de aplicar limite
- Usar identificador diferente (user_id em vez de IP)

### 5. Documente Mudanças

```bash
# git commit message
git commit -m "chore: aumentar rate limit de login para 10/15min

Razão: Usuários reportando bloqueios legítimos em horário de pico.
Monitoramento mostra 3% de falsos positivos.

Antes: 5 tentativas / 15 min
Depois: 10 tentativas / 15 min"
```

---

## 🚨 Troubleshooting

### "Sempre bloqueado no primeiro login"

**Causa:** Rate limit muito baixo ou janela muito longa

**Solução:**
```bash
RATE_LIMIT_LOGIN_MAX=10  # Aumentar
RATE_LIMIT_LOGIN_WINDOW_MIN=5  # Reduzir janela
```

### "Rate limit não está funcionando"

**Checklist:**
1. ✅ Variável está definida no ambiente correto?
2. ✅ Worker foi redeployado após mudança?
3. ✅ Valor é número válido (sem aspas no .env)?
4. ✅ Nome da variável está correto?

### "Rate limit funciona localmente mas não em produção"

**Causa:** Variáveis não definidas em produção

**Solução:**
1. Verificar Cloudflare Dashboard → Variables
2. Ou adicionar ao `wrangler.jsonc`
3. Redeploy: `wrangler deploy`

---

## 📚 Referências

- [Código: `src/lib/utils/rate-limiter.ts`](./src/lib/utils/rate-limiter.ts)
- [Documentação: `SECURITY_IMPROVEMENTS.md`](./SECURITY_IMPROVEMENTS.md)
- [Testes: `src/lib/utils/__tests__/rate-limiter.test.ts`](./src/lib/utils/__tests__/rate-limiter.test.ts)

---

*Documentação atualizada: 2026-02-06*  
*Rate Limits totalmente configuráveis via Environment Variables* ⚙️✨
