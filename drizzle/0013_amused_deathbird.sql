ALTER TABLE `taxonomies` ADD `id_locale_code` integer REFERENCES locales(id);--> statement-breakpoint
CREATE INDEX `taxonomies_id_locale_code_idx` ON `taxonomies` (`id_locale_code`);