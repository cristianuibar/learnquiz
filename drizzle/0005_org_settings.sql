CREATE TABLE `org_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`working_hours_json` text NOT NULL,
	`logo_key` text,
	`accent` text,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
