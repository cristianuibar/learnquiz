ALTER TABLE `push_log` ADD `item_id` text;--> statement-breakpoint
ALTER TABLE `push_log` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `push_log` ADD `opened_at` integer;--> statement-breakpoint
ALTER TABLE `push_prefs` ADD `paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `push_prefs` ADD `start_minute` integer DEFAULT 540 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_prefs` ADD `end_minute` integer DEFAULT 1020 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_prefs` ADD `timezone` text DEFAULT 'UTC' NOT NULL;