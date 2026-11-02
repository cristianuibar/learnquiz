PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text,
	`job_role_id` text,
	`title` text NOT NULL,
	`goal` text,
	`generated_by` text,
	`status` text DEFAULT 'generating' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_role_id`) REFERENCES `job_roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_topics`("id", "learner_id", "title", "goal", "generated_by", "status", "created_at") SELECT "id", "learner_id", "title", "goal", "generated_by", "status", "created_at" FROM `topics`;--> statement-breakpoint
DROP TABLE `topics`;--> statement-breakpoint
ALTER TABLE `__new_topics` RENAME TO `topics`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `topics_job_role_id_unique` ON `topics` (`job_role_id`);
--> statement-breakpoint
INSERT INTO `topics` (`id`, `job_role_id`, `title`, `status`, `created_at`)
SELECT lower(hex(randomblob(16))), `id`, `name`, 'draft', `created_at`
FROM `job_roles`
WHERE NOT EXISTS (SELECT 1 FROM `topics` WHERE `topics`.`job_role_id` = `job_roles`.`id`);
