CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`autoload` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_name_idx` ON `settings` (`name`);--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_type_id` integer NOT NULL,
	`author_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`body` text,
	`status` text DEFAULT 'draft',
	`meta_values` text,
	`published_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "post_type_id", "author_id", "title", "slug", "excerpt", "body", "status", "meta_values", "published_at", "created_at", "updated_at") SELECT "id", "post_type_id", "author_id", "title", "slug", "excerpt", "body", "status", "meta_values", "published_at", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `posts_post_type_id_idx` ON `posts` (`post_type_id`);--> statement-breakpoint
CREATE INDEX `posts_author_id_idx` ON `posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `posts_status_idx` ON `posts` (`status`);--> statement-breakpoint
CREATE INDEX `posts_created_at_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_updated_at_idx` ON `posts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `posts_slug_idx` ON `posts` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_taxonomies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`parent_id` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_taxonomies`("id", "name", "slug", "description", "type", "parent_id", "created_at", "updated_at") SELECT "id", "name", "slug", "description", "type", "parent_id", "created_at", "updated_at" FROM `taxonomies`;--> statement-breakpoint
DROP TABLE `taxonomies`;--> statement-breakpoint
ALTER TABLE `__new_taxonomies` RENAME TO `taxonomies`;--> statement-breakpoint
CREATE INDEX `taxonomies_type_idx` ON `taxonomies` (`type`);--> statement-breakpoint
CREATE INDEX `taxonomies_parent_id_idx` ON `taxonomies` (`parent_id`);--> statement-breakpoint
CREATE INDEX `taxonomies_slug_idx` ON `taxonomies` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomies_type_slug_idx` ON `taxonomies` (`type`,`slug`);--> statement-breakpoint
CREATE TABLE `__new_post_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`meta_schema` text DEFAULT '[{"key":"menu_order","type":"number","default":0},{"key":"parent_id","type":"number"},{"key":"show_in_menu","type":"boolean","default":false},{"key":"menu_options","type":"array","default":[]},{"key":"icon","type":"string","default":"line-md:document"},{"key":"post_thumbnail","type":"boolean","default":false}]',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_post_types`("id", "slug", "name", "meta_schema", "created_at", "updated_at") SELECT "id", "slug", "name", "meta_schema", "created_at", "updated_at" FROM `post_types`;--> statement-breakpoint
DROP TABLE `post_types`;--> statement-breakpoint
ALTER TABLE `__new_post_types` RENAME TO `post_types`;--> statement-breakpoint
CREATE UNIQUE INDEX `post_types_slug_unique` ON `post_types` (`slug`);--> statement-breakpoint
CREATE INDEX `post_types_slug_idx` ON `post_types` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` integer DEFAULT 3,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "role", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", "role", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `__new_posts_media` (
	`post_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `media_id`)
);
--> statement-breakpoint
INSERT INTO `__new_posts_media`("post_id", "media_id") SELECT "post_id", "media_id" FROM `posts_media`;--> statement-breakpoint
DROP TABLE `posts_media`;--> statement-breakpoint
ALTER TABLE `__new_posts_media` RENAME TO `posts_media`;--> statement-breakpoint
CREATE INDEX `posts_media_post_id_idx` ON `posts_media` (`post_id`);--> statement-breakpoint
CREATE INDEX `posts_media_media_id_idx` ON `posts_media` (`media_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_taxonomies_post_id_idx` ON `posts_taxonomies` (`post_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_taxonomies_term_id_idx` ON `posts_taxonomies` (`term_id`);