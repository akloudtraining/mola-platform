CREATE TABLE `auth_identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_user_id` text NOT NULL,
	`auth_user_id` text NOT NULL,
	`email` text NOT NULL,
	`linked_at` text NOT NULL,
	`purpose` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_identity_legacy` ON `auth_identity_links` (`legacy_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_identity_user` ON `auth_identity_links` (`auth_user_id`);