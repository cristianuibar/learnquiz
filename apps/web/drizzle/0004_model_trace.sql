ALTER TABLE `items` ADD `generated_by` text;--> statement-breakpoint
ALTER TABLE `model_calls` ADD `topic_id` text;--> statement-breakpoint
ALTER TABLE `topics` ADD `generated_by` text;