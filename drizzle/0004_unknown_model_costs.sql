PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_model_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text,
	`session_id` text,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_model_calls`("id", "learner_id", "session_id", "purpose", "model", "latency_ms", "prompt_tokens", "completion_tokens", "reasoning_tokens", "cost_usd", "ok", "error", "created_at") SELECT "id", "learner_id", "session_id", "purpose", "model", "latency_ms", "prompt_tokens", "completion_tokens", "reasoning_tokens", "cost_usd", "ok", "error", "created_at" FROM `model_calls`;--> statement-breakpoint
DROP TABLE `model_calls`;--> statement-breakpoint
ALTER TABLE `__new_model_calls` RENAME TO `model_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;