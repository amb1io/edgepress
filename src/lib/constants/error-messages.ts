// Error messages centralizadas
export const ERROR_MESSAGES = {
  // Validação
  MISSING_REQUIRED_FIELDS: 'Campos obrigatórios não foram preenchidos',
  INVALID_POST_TYPE: 'Tipo de post inválido',
  INVALID_POST_ID: 'ID do post inválido',
  INVALID_LOCALE: 'Locale inválido',
  
  // Autenticação/Autorização
  UNAUTHORIZED: 'Não autorizado',
  FORBIDDEN: 'Acesso negado',
  
  // Operações de banco de dados
  POST_NOT_FOUND: 'Post não encontrado',
  TAXONOMY_NOT_FOUND: 'Taxonomia não encontrada',
  USER_NOT_FOUND: 'Usuário não encontrado',
  ATTACHMENT_NOT_FOUND: 'Anexo não encontrado',
  
  // Upload
  FILE_TOO_LARGE: 'Arquivo muito grande',
  INVALID_FILE_TYPE: 'Tipo de arquivo inválido',
  UPLOAD_FAILED: 'Falha no upload do arquivo',
  
  // Genérico
  INTERNAL_SERVER_ERROR: 'Erro interno do servidor',
  BAD_REQUEST: 'Requisição inválida',
} as const;

// Mensagens localizadas
export const ERROR_MESSAGES_LOCALIZED: Record<string, Record<string, string>> = {
  'pt-br': ERROR_MESSAGES,
  'en': {
    MISSING_REQUIRED_FIELDS: 'Required fields were not filled',
    INVALID_POST_TYPE: 'Invalid post type',
    INVALID_POST_ID: 'Invalid post ID',
    INVALID_LOCALE: 'Invalid locale',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Access denied',
    POST_NOT_FOUND: 'Post not found',
    TAXONOMY_NOT_FOUND: 'Taxonomy not found',
    USER_NOT_FOUND: 'User not found',
    ATTACHMENT_NOT_FOUND: 'Attachment not found',
    FILE_TOO_LARGE: 'File too large',
    INVALID_FILE_TYPE: 'Invalid file type',
    UPLOAD_FAILED: 'File upload failed',
    INTERNAL_SERVER_ERROR: 'Internal server error',
    BAD_REQUEST: 'Bad request',
  },
};

export function getErrorMessage(key: keyof typeof ERROR_MESSAGES, locale: string = 'pt-br'): string {
  return ERROR_MESSAGES_LOCALIZED[locale]?.[key] || ERROR_MESSAGES[key];
}
