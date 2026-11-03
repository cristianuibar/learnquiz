CREATE TABLE `item_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `item_flags_item_idx` ON `item_flags` (`item_id`);--> statement-breakpoint
ALTER TABLE `concepts` ADD `gen_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `concepts` ADD `gen_error` text;--> statement-breakpoint
ALTER TABLE `items` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `items` ADD `source_version` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `r2_key` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `uploaded_by` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `error` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `retired_at` integer;--> statement-breakpoint
ALTER TABLE `topics` ADD `org_id` text;--> statement-breakpoint
CREATE INDEX `attempts_learner_at_idx` ON `attempts` (`learner_id`,`at`);--> statement-breakpoint
CREATE INDEX `model_calls_created_at_idx` ON `model_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_learner_idx` ON `sessions` (`learner_id`);--> statement-breakpoint
UPDATE `topics` SET `org_id` = (SELECT `org_id` FROM `job_roles` WHERE `job_roles`.`id` = `topics`.`job_role_id`) WHERE `job_role_id` IS NOT NULL;