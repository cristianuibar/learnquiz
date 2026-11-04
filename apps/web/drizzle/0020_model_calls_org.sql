ALTER TABLE `model_calls` ADD `org_id` text;--> statement-breakpoint
CREATE INDEX `model_calls_org_created_at_idx` ON `model_calls` (`org_id`,`created_at`);--> statement-breakpoint
UPDATE `model_calls` SET `org_id` = (SELECT `org_id` FROM `topics` WHERE `topics`.`id` = `model_calls`.`topic_id`) WHERE `topic_id` IS NOT NULL;
