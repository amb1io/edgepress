import { join } from "node:path";

export const MIGRATION_ROOT = join(process.cwd(), "migration", "blog-rhamses");
export const BLOG_SOURCE_ROOT = "/Users/rhamses/Sites/blog.rhamses.com.br";
export const BLOG_POSTS_DIR = join(BLOG_SOURCE_ROOT, "src", "data", "blog-posts");
export const IMAGES_DIR = join(MIGRATION_ROOT, "images");
export const DATA_DIR = join(MIGRATION_ROOT, "data");
export const OUTPUT_DIR = join(MIGRATION_ROOT, "output");
export const POSTS_PT_JSON = join(DATA_DIR, "posts-pt.json");
export const POSTS_EN_JSON = join(DATA_DIR, "posts-en.json");
export const MIGRATION_SQL = join(OUTPUT_DIR, "migration.sql");
export const MEDIA_UPLOAD_PREFIX = "uploads/blog";
