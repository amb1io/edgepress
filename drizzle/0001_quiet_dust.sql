PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_post_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`meta_schema` text DEFAULT '[{"key":"menu_order","type":"number"},{"key":"mime_type","type":"string"},{"key":"parent_id","type":"number"}]',
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_post_types`("id", "slug", "name", "meta_schema", "created_at") SELECT "id", "slug", "name", "meta_schema", "created_at" FROM `post_types`;--> statement-breakpoint
DROP TABLE `post_types`;--> statement-breakpoint
ALTER TABLE `__new_post_types` RENAME TO `post_types`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `post_types_slug_unique` ON `post_types` (`slug`);