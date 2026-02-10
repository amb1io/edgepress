/**
 * Helpers para autenticação e autorização em endpoints de API.
 * - requireAuth: exige sessão válida.
 * - requireMinRole: exige sessão e role mínimo (0=admin, 1=editor, 2=autor, 3=leitor).
 * - assertCanSetUserRole: previne escalação de privilégios ao alterar role de usuário.
 * - assertAuthorIdForRole: restringe author_id em posts conforme role do usuário.
 */
import { auth } from "./auth.ts";
import { unauthorizedResponse } from "./utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "./constants/index.ts";

export type SessionUser = { id: string; name: string; email: string; role?: number; [k: string]: unknown };
export type Session = { user: SessionUser; session: { id: string; userId: string; [k: string]: unknown } };

/** Obtém sessão a partir dos headers da request (útil em API routes). */
export async function getSession(request: Request): Promise<Session | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  return result ? { user: result.user as SessionUser, session: result.session } : null;
}

/** Tipo de locals do Astro (user/session podem vir do middleware). */
export interface ApiLocals {
  user?: SessionUser | null;
  session?: Session["session"] | null;
}

/**
 * Exige usuário autenticado. Retorna { user, session } ou Response 401.
 * Preferir locals quando disponível (já preenchido pelo middleware).
 */
export async function requireAuth(
  request: Request,
  locals?: ApiLocals | null
): Promise<{ user: SessionUser; session: Session["session"] } | Response> {
  if (locals?.user && locals?.session) {
    return { user: locals.user, session: locals.session };
  }
  const session = await getSession(request);
  if (!session) {
    return unauthorizedResponse("Autenticação necessária");
  }
  return { user: session.user, session: session.session };
}

/**
 * Exige autenticação e role mínimo.
 * Role: 0 = administrador, 1 = editor, 2 = autor, 3 = leitor (menor número = mais privilégio).
 * minRole = 0 → apenas admin; minRole = 1 → admin ou editor; etc.
 */
export async function requireMinRole(
  request: Request,
  minRole: number,
  locals?: ApiLocals | null
): Promise<{ user: SessionUser; session: Session["session"] } | Response> {
  const authResult = await requireAuth(request, locals);
  if (authResult instanceof Response) return authResult;
  const role = authResult.user.role ?? 3;
  if (role > minRole) {
    return new Response(
      JSON.stringify({ error: "Forbidden", message: "Sem permissão para esta ação" }),
      { status: HTTP_STATUS_CODES.FORBIDDEN, headers: { "Content-Type": "application/json" } }
    );
  }
  return authResult;
}

/**
 * Verifica se o usuário atual pode definir o role de outro usuário.
 * Regras: apenas admin (role 0) pode alterar roles; não pode atribuir role mais alto que o próprio.
 * Retorna null se permitido, ou mensagem de erro.
 */
export function assertCanSetUserRole(
  actorRole: number,
  actorId: string,
  targetUserId: string,
  newRole: number
): string | null {
  // Apenas administrador pode alterar roles
  if (actorRole !== 0) {
    return "Apenas administradores podem alterar funções de usuário";
  }
  // Não pode atribuir privilégio maior que o seu (número menor = mais privilégio)
  if (newRole < actorRole) {
    return "Não é permitido atribuir função com mais privilégios que a sua";
  }
  return null;
}

/**
 * Para posts: autor (role 2) só pode atribuir author_id a si mesmo.
 * Editor (1) e admin (0) podem atribuir qualquer author_id.
 * Retorna o author_id permitido (possivelmente forçado para o próprio usuário).
 */
export function resolveAuthorIdForRole(
  requestedAuthorId: string | null,
  currentUserId: string,
  currentUserRole: number
): string | null {
  if (!requestedAuthorId || !requestedAuthorId.trim()) return null;
  const trimmed = requestedAuthorId.trim();
  // Admin e editor podem definir qualquer autor
  if (currentUserRole <= 1) return trimmed;
  // Autor só pode ser ele mesmo
  if (currentUserRole === 2) return trimmed === currentUserId ? trimmed : currentUserId;
  // Leitor não deveria criar posts; se chegar aqui, usa próprio id
  return currentUserId;
}
