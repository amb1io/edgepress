// Post statuses
export const POST_STATUSES = ['published', 'draft', 'archived'] as const;
export type PostStatus = typeof POST_STATUSES[number];

// HTTP status codes
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Default pagination settings
export const DEFAULT_PAGINATION = {
  limit: 10,
  page: 1,
  maxLimit: 100,
} as const;

// Upload constants
export const UPLOAD_CONSTANTS = {
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

// Content types
export const CONTENT_TYPES = {
  JSON: 'application/json',
  HTML: 'text/html',
  TEXT: 'text/plain',
} as const;
