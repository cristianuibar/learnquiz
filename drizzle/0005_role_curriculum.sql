ALTER TABLE `concepts` ADD `critical` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `topics` ADD `job_role_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `topics_job_role_id_unique` ON `topics` (`job_role_id`);