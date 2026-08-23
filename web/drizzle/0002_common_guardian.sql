CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`base_url` text,
	`api_key` text,
	`model` text,
	`model_by_stage_json` text DEFAULT '{}' NOT NULL,
	`generation_provider` text,
	`marking_provider` text,
	`last_test_json` text DEFAULT 'null',
	`updated_at` integer,
	`updated_by_user_id` text,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
