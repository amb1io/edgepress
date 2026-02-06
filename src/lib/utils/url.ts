/**
 * Constrói uma URL absoluta a partir de um caminho relativo usando a URL da requisição como base
 * @param request - Objeto Request do qual extrair o protocolo e host
 * @param path - Caminho relativo ou absoluto para construir a URL
 * @returns URL absoluta como string
 */
export function buildAbsoluteUrl(request: Request, path: string): string {
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  return new URL(path, baseUrl).toString();
}

/**
 * Constrói uma URL de redirecionamento para a lista de conteúdo
 * @param locale - Locale do usuário
 * @param type - Tipo de post
 * @param limit - Limite de itens por página (padrão: 10)
 * @param page - Número da página (padrão: 1)
 * @returns Caminho relativo da URL
 */
export function buildListUrl(locale: string, type: string, limit: number = 10, page: number = 1): string {
  return `/${locale}/admin/list?type=${type}&limit=${limit}&page=${page}`;
}

/**
 * Constrói uma URL de redirecionamento para o formulário de edição de conteúdo
 * @param locale - Locale do usuário
 * @param postType - Tipo de post
 * @param action - Ação (create ou edit)
 * @param id - ID do post (opcional, usado para edição)
 * @returns Caminho relativo da URL
 */
export function buildContentUrl(locale: string, postType: string, action: string, id?: string | number): string {
  let url = `/${locale}/admin/content?post_type=${postType}&action=${action}`;
  if (id) {
    url += `&id=${id}`;
  }
  return url;
}
