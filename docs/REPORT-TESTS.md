# Relatório de Testes

Gerado em: 2026-02-20

## Resumo

- **Test files:** 18 passaram, 9 falharam (27 total)
- **Testes:** 214 passaram, 49 ignorados (skipped), 0 falhas nos testes que rodaram
- **Novos testes adicionados:** todos passando
  - `src/lib/utils/__tests__/runtime-locals.test.ts` (8 testes) ✓
  - `src/lib/utils/__tests__/form-data.test.ts` (19 testes) ✓
  - `src/lib/__tests__/db-utils.test.ts` (9 testes) ✓

## Falhas (suites que não chegam a rodar os testes)

As 9 suites que “falharam” quebram na **configuração/setup** (migração ou schema), não nos asserts. Os testes em si estão em grande parte **skipped** ou não executados por causa disso.

### 1. Migração ausente (6 suites)

**Arquivos:**  
`src/db/__tests__/auth.test.ts`, `post.test.ts`, `post_type.test.ts`, `posts_media.test.ts`, `posts_taxonomies.test.ts`, `taxonomies.test.ts`

**Erro:**
```
Error: No file ./drizzle/0012_dashing_masque.sql found in ./drizzle folder
  at readMigrationFiles (node_modules/drizzle-orm/migrator.js)
  at migrate (node_modules/drizzle-orm/libsql/migrator.js)
  at createTestDb (src/db/__tests__/setup.ts:36:9)
```

**Motivo:** O migrator do Drizzle procura um arquivo chamado `0012_dashing_masque.sql`. No repositório existe `0012_make_post_type_id_not_null.sql`. Isso indica que o **journal ou o histórico de migrações** ainda referencia o nome antigo (`dashing_masque`), gerado pelo drizzle-kit em outra máquina/versão. Ou o `migrationsFolder` no teste está resolvendo para um diretório que não contém os arquivos esperados (ex.: CWD diferente ao rodar vitest).

**Ação sugerida:** Alinhar o nome do arquivo de migração com o que o journal espera, ou regenerar/atualizar o journal de migrações (drizzle-kit) e garantir que os testes rodem com `migrationsFolder` apontando para a pasta que contém os `.sql` atuais.

---

### 2. Mesmo erro de migração em mais 2 suites

**Arquivos:**  
`src/lib/__tests__/list-items.test.ts`, `src/lib/__tests__/menu.test.ts`

**Erro:** Idêntico ao acima: `No file ./drizzle/0012_dashing_masque.sql found in ./drizzle folder` (chamada a `migrate(db, { migrationsFolder: "./drizzle" })` dentro do teste).

**Motivo:** Mesmo uso do `createTestDb()` ou de `migrate(..., "./drizzle")` que depende do arquivo `0012_dashing_masque.sql`.

**Ação sugerida:** Igual ao item 1: corrigir referência ao arquivo de migração ou ao caminho do `drizzle` folder.

---

### 3. Schema desatualizado (content-source)

**Arquivo:** `src/lib/__tests__/content-source.test.ts`

**Erro:**
```
LibsqlError: SQLITE_ERROR: table posts has no column named parent_id
```

**Motivo:** O teste insere em `posts` incluindo a coluna `parent_id`. O banco em memória usado no teste foi criado com um conjunto de migrações que **não** inclui a migração que adiciona `parent_id` (no repo existe `drizzle/0013_add_posts_parent_id.sql`). Ou seja: o schema do teste está atrás do schema atual do app.

**Ação sugerida:** Garantir que o setup do teste (incluindo migrações) rode todas as migrações atuais (por exemplo corrigindo o item 1) para que a tabela `posts` tenha a coluna `parent_id` antes de rodar `content-source.test.ts`.

---

## Suites que passaram (exemplos)

- `src/lib/utils/__tests__/runtime-locals.test.ts`
- `src/lib/utils/__tests__/form-data.test.ts`
- `src/lib/utils/__tests__/url-validator.test.ts`
- `src/lib/utils/__tests__/rate-limiter.test.ts`
- `src/lib/__tests__/db-utils.test.ts`
- `src/lib/__tests__/content-cache.test.ts`
- `src/lib/__tests__/auth-email-password.test.ts`
- `src/pages/api/__tests__/register.test.ts`
- `src/pages/api/__tests__/taxonomies.test.ts`
- `src/pages/api/__tests__/upload.test.ts`
- Entre outras listadas na saída do `npm test`.

---

## Conclusão

- Os **novos testes** dos helpers (runtime-locals, form-data, db-utils) estão implementados e **todos passando**.
- As **falhas atuais** vêm de ambiente/setup (migração `0012_dashing_masque.sql` ausente e schema de `posts` sem `parent_id` no teste), não das alterações recentes nos helpers.

Para ter a suíte verde de ponta a ponta, é necessário corrigir o caminho/nome das migrações usadas nos testes e garantir que o schema do banco de teste esteja alinhado com o schema atual (incluindo `parent_id` em `posts`).
