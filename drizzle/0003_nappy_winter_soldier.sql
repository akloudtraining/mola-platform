CREATE TABLE `test_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `test_organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_test_entries_org` ON `test_entries` (`org_id`);--> statement-breakpoint
CREATE TABLE `test_notification_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`event_id` text NOT NULL,
	`read_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `test_organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_test_reads_user_org` ON `test_notification_reads` (`user_id`,`org_id`);--> statement-breakpoint
CREATE TABLE `test_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `test_workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `test_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`owner` text NOT NULL,
	`created` text NOT NULL
);
