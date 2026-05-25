-- Prefixo edp_ nas tabelas de aplicação (estilo wp_ do WordPress).
ALTER TABLE `user` RENAME TO `edp_user`;--> statement-breakpoint
ALTER TABLE `session` RENAME TO `edp_session`;--> statement-breakpoint
ALTER TABLE `account` RENAME TO `edp_account`;--> statement-breakpoint
ALTER TABLE `verification` RENAME TO `edp_verification`;--> statement-breakpoint
ALTER TABLE `post_types` RENAME TO `edp_post_types`;--> statement-breakpoint
ALTER TABLE `posts` RENAME TO `edp_posts`;--> statement-breakpoint
ALTER TABLE `taxonomies` RENAME TO `edp_taxonomies`;--> statement-breakpoint
ALTER TABLE `posts_taxonomies` RENAME TO `edp_posts_taxonomies`;--> statement-breakpoint
ALTER TABLE `posts_media` RENAME TO `edp_posts_media`;--> statement-breakpoint
ALTER TABLE `settings` RENAME TO `edp_settings`;--> statement-breakpoint
ALTER TABLE `role_capability` RENAME TO `edp_role_capability`;--> statement-breakpoint
ALTER TABLE `locales` RENAME TO `edp_locales`;--> statement-breakpoint
ALTER TABLE `translations` RENAME TO `edp_translations`;--> statement-breakpoint
ALTER TABLE `translations_languages` RENAME TO `edp_translations_languages`;
