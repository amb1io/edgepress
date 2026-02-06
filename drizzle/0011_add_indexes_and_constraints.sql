-- Migration: Add indexes and improve constraints
-- Date: 2026-02-06
-- Description: Add performance indexes to frequently queried columns

-- ============================================
-- POSTS TABLE - Add indexes
-- ============================================

-- Index for post_type_id (used in joins and filters)
CREATE INDEX IF NOT EXISTS "posts_post_type_id_idx" ON "posts" ("post_type_id");

-- Index for author_id (used in joins and filters)
CREATE INDEX IF NOT EXISTS "posts_author_id_idx" ON "posts" ("author_id");

-- Index for status (frequently filtered)
CREATE INDEX IF NOT EXISTS "posts_status_idx" ON "posts" ("status");

-- Index for created_at (used for sorting)
CREATE INDEX IF NOT EXISTS "posts_created_at_idx" ON "posts" ("created_at");

-- Index for updated_at (used for sorting)
CREATE INDEX IF NOT EXISTS "posts_updated_at_idx" ON "posts" ("updated_at");

-- Index for slug (used for lookups)
CREATE INDEX IF NOT EXISTS "posts_slug_idx" ON "posts" ("slug");

-- ============================================
-- POST_TYPES TABLE - Add indexes
-- ============================================

-- Index for slug (frequently queried)
CREATE INDEX IF NOT EXISTS "post_types_slug_idx" ON "post_types" ("slug");

-- ============================================
-- TAXONOMIES TABLE - Add indexes
-- ============================================

-- Index for type (frequently filtered)
CREATE INDEX IF NOT EXISTS "taxonomies_type_idx" ON "taxonomies" ("type");

-- Index for parent_id (hierarchical queries)
CREATE INDEX IF NOT EXISTS "taxonomies_parent_id_idx" ON "taxonomies" ("parent_id");

-- Index for slug (used for lookups)
CREATE INDEX IF NOT EXISTS "taxonomies_slug_idx" ON "taxonomies" ("slug");

-- Unique index for type+slug combination
CREATE UNIQUE INDEX IF NOT EXISTS "taxonomies_type_slug_idx" ON "taxonomies" ("type", "slug");

-- ============================================
-- POSTS_TAXONOMIES TABLE - Add indexes
-- ============================================

-- Index for post_id (used in joins)
CREATE INDEX IF NOT EXISTS "posts_taxonomies_post_id_idx" ON "posts_taxonomies" ("post_id");

-- Index for term_id (used in joins)
CREATE INDEX IF NOT EXISTS "posts_taxonomies_term_id_idx" ON "posts_taxonomies" ("term_id");

-- ============================================
-- POSTS_MEDIA TABLE - Add indexes
-- ============================================

-- Index for post_id (used in joins)
CREATE INDEX IF NOT EXISTS "posts_media_post_id_idx" ON "posts_media" ("post_id");

-- Index for media_id (used in joins)
CREATE INDEX IF NOT EXISTS "posts_media_media_id_idx" ON "posts_media" ("media_id");
