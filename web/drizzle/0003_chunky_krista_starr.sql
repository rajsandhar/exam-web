CREATE TABLE `asset_syllabus_items` (
	`asset_id` text NOT NULL,
	`syllabus_item_id` text NOT NULL,
	PRIMARY KEY(`asset_id`, `syllabus_item_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`original_filename` text NOT NULL,
	`byte_size` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`alt_text` text NOT NULL,
	`licence` text NOT NULL,
	`captions_extension` text,
	`uploaded_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_kind_idx` ON `assets` (`kind`);