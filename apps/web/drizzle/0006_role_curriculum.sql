ALTER TABLE `concepts` ADD `critical` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `deleted_at` integer;