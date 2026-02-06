CREATE TABLE `post_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`meta_schema` text DEFAULT 'menu_order, mime_type, parent_id',
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_types_slug_unique` ON `post_types` (`slug`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_id` integer,
	`author_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`body` text,
	`status` text DEFAULT 'draft',
	`meta_values` text,
	`published_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`type_id`) REFERENCES `post_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE TABLE `posts_media` (
	`post_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `media_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts_taxonomies` (
	`post_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `term_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `taxonomies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `taxonomies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`parent_id` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `taxonomies`(`id`) ON UPDATE no action ON DELETE no action
);
