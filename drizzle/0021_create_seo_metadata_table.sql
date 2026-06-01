-- SEO metadata (1:1 com posts)
CREATE TABLE `edp_seo_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`seo_canonical` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `edp_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seo_metadata_post_id_unique` ON `edp_seo_metadata` (`post_id`);
--> statement-breakpoint
CREATE INDEX `seo_metadata_post_id_idx` ON `edp_seo_metadata` (`post_id`);
