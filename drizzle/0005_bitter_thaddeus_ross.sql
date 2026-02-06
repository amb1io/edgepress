PRAGMA defer_foreign_keys=on;--> statement-breakpoint
CREATE TABLE `__new_post_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`meta_schema` text DEFAULT '[{"key":"menu_order","type":"number","default":0},{"key":"parent_id","type":"number"},{"key":"show_in_menu","type":"boolean","default":false},{"key":"menu_options","type":"array","default":[]},{"key":"icon","type":"string","default":"line-md:document"}]',
	`created_at` integer,
	`updated_at` integer
);
INSERT INTO `__new_post_types`("id", "slug", "name", "meta_schema", "created_at", "updated_at") SELECT "id", "slug", "name", "meta_schema", "created_at", "updated_at" FROM `post_types`;
DROP TABLE `post_types`;
ALTER TABLE `__new_post_types` RENAME TO `post_types`;
PRAGMA defer_foreign_keys=off;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `post_types_slug_unique` ON `post_types` (`slug`);
