/**
 * Script para executar o seed no banco D1 local
 * 
 * Como o seed precisa acessar o banco D1 que só está disponível no contexto
 * do Cloudflare Workers, este script fornece instruções para executar o seed.
 * 
 * O seed pode ser executado de duas formas:
 * 1. Via API /api/seed (requer autenticação de admin)
 * 2. Via página de setup /pt-br/setup (executa automaticamente)
 */

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Executar Seed                             ║
╚══════════════════════════════════════════════════════════════╝

Para executar o seed do banco de dados, você tem duas opções:

📌 Opção 1: Via API (Recomendado)
   1. Inicie o servidor: npm run dev
   2. Faça login como administrador
   3. Acesse: http://localhost:4321/api/seed
   
   Ou via curl (após autenticação):
   curl -X GET http://localhost:4321/api/seed \\
     -H "Cookie: better-auth.session_token=SEU_TOKEN"

📌 Opção 2: Via Página de Setup
   1. Acesse: http://localhost:4321/pt-br/setup
   2. O seed será executado automaticamente durante o setup inicial

⚠️  Nota: O seed popula as tabelas:
   - locales (en_US, es_ES, pt_BR)
   - translations (chaves de tradução)
   - translations_languages (traduções por locale)
   - post_types, taxonomies, settings, etc.

`);
