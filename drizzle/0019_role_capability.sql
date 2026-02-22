CREATE TABLE IF NOT EXISTS `role_capability` (
	`role_id` integer NOT NULL,
	`capability` text NOT NULL,
	PRIMARY KEY(`role_id`,`capability`)
);
