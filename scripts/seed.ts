/**
 * Script para executar o seed no banco D1 via wrangler
 * Uso: npm run seed (local) ou npm run seed:remote (remoto)
 */
import { getDatabase } from "@cloudflare/workers-types/experimental";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { runSeed } from "../src/db/seed.ts";

// Este script precisa ser executado via wrangler dev ou usando a API
// Por enquanto, vamos usar a abordagem de endpoint API

console.log(`
Para executar o seed:

1. Inicie o servidor: npm run dev
2. Acesse: http://localhost:4321/api/seed (requer autenticação de admin)
   OU
   Acesse: http://localhost:4321/pt-br/setup (se ainda não fez setup)

Alternativamente, você pode executar via curl após autenticação:
curl -X GET http://localhost:4321/api/seed -H "Cookie: better-auth.session_token=..."
`);
