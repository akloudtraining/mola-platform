CREATE TABLE `notification_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`event_id` text NOT NULL,
	`read_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notification_reads_user_org` ON `notification_reads` (`user_id`,`org_id`);