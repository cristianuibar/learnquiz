CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`session_id` text,
	`item_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`at` integer NOT NULL,
	`answer_json` text NOT NULL,
	`correct` integer NOT NULL,
	`score` real NOT NULL,
	`confidence` text NOT NULL,
	`response_ms` integer NOT NULL,
	`grade_json` text,
	`rating` integer NOT NULL,
	`p_known_before` real NOT NULL,
	`p_known_after` real NOT NULL,
	`retrievability_before` real
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`learner_id` text NOT NULL,
	`badge` text NOT NULL,
	`earned_at` integer NOT NULL,
	PRIMARY KEY(`learner_id`, `badge`)
);
--> statement-breakpoint
CREATE TABLE `concept_edges` (
	`topic_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`why` text,
	PRIMARY KEY(`from_id`, `to_id`)
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`order` integer NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`level` integer DEFAULT 3 NOT NULL,
	`source_id` text,
	`source_quote` text,
	`misconceptions_json` text DEFAULT '[]' NOT NULL,
	`grounded` integer DEFAULT false NOT NULL,
	`visual` integer DEFAULT false NOT NULL,
	`image_key` text,
	`image_alt` text
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`format` text NOT NULL,
	`payload_json` text NOT NULL,
	`difficulty_prior` integer DEFAULT 3 NOT NULL,
	`elo_difficulty` real,
	`check_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_concept` (
	`learner_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`p_known` real NOT NULL,
	`n_attempts` integer DEFAULT 0 NOT NULL,
	`mastered_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`learner_id`, `concept_id`)
);
--> statement-breakpoint
CREATE TABLE `learner_item` (
	`learner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`state` integer NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`scheduled_days` real DEFAULT 0 NOT NULL,
	`last_wrong_confident_at` integer,
	PRIMARY KEY(`learner_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `learner_topic` (
	`learner_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`level` integer DEFAULT 3 NOT NULL,
	`rating` real DEFAULT 1500 NOT NULL,
	`last_session_at` integer,
	`streak_count` integer DEFAULT 0 NOT NULL,
	`streak_freeze_available` integer DEFAULT true NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`learner_id`, `topic_id`)
);
--> statement-breakpoint
CREATE TABLE `model_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text,
	`session_id` text,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `placements` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`log_json` text NOT NULL,
	`level_result` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_ids_json` text DEFAULT '[]' NOT NULL,
	`plan_json` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body_text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text,
	`status` text DEFAULT 'generating' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`order` integer NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`unlocked_at` integer
);
