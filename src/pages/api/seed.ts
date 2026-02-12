/**
 * GET /api/seed
 * Executa o seed do banco de dados
 * Protegido: requer autenticação e role de administrador
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { runSeed } from "../../db/seed.ts";
import { requireMinRole } from "../../lib/api-auth.ts";
import { jsonResponse } from "../../lib/utils/http-responses.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  // Requer autenticação e role de administrador (role 0)
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    console.log("Executando seed...");
    await runSeed(db);
    console.log("Seed executado com sucesso!");
    
    return jsonResponse({ 
      success: true, 
      message: "Seed executado com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao executar seed:", error);
    return jsonResponse(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      },
      500
    );
  }
};
