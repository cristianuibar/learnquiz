CREATE TABLE `learner_unit` (
	`learner_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	PRIMARY KEY(`learner_id`, `unit_id`)
);
--> statement-breakpoint
INSERT INTO `learner_unit` (`learner_id`, `unit_id`, `unlocked_at`)
SELECT `topics`.`learner_id`, `units`.`id`, `units`.`unlocked_at`
FROM `units`
INNER JOIN `topics` ON `topics`.`id` = `units`.`topic_id`
WHERE `units`.`unlocked_at` IS NOT NULL;
