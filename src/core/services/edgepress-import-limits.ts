/**
 * Shared size limits for EdgePress import/export archives.
 */

/** Hard limit enforced on POST /api/import (matches Cloudflare Workers free-tier body limit). */
export const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024;

/** Target max size per part when splitting multi-part exports (fits Worker ~128 MB staging budget). */
export const MAX_IMPORT_PART_BYTES = 40 * 1024 * 1024;
