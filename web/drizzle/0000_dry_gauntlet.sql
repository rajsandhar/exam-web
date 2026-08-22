CREATE TABLE `archetypes` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`renderer_type` text NOT NULL,
	`stimulus_type` text,
	`typical_marks_json` text DEFAULT '[]' NOT NULL,
	`command_verbs_json` text DEFAULT '[]' NOT NULL,
	`cognitive_demand` text NOT NULL,
	`multipart` integer DEFAULT false NOT NULL,
	`transformation_pattern` text,
	`marking_structure` text,
	`topic_suitability_json` text DEFAULT '[]' NOT NULL,
	`observed_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attempt_flags` (
	`attempt_id` text NOT NULL,
	`question_group_id` text NOT NULL,
	PRIMARY KEY(`attempt_id`, `question_group_id`),
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_group_id`) REFERENCES `question_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`created_at` integer NOT NULL,
	`reading_started_at` integer,
	`working_started_at` integer,
	`working_expires_at` integer,
	`submitted_at` integer,
	`final_score` integer,
	`marking_status` text DEFAULT 'pending' NOT NULL,
	`marking_error` text,
	`ui_state_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_exam_idx` ON `attempts` (`exam_id`);--> statement-breakpoint
CREATE TABLE `chunk_syllabus_items` (
	`chunk_id` text NOT NULL,
	`syllabus_item_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	PRIMARY KEY(`chunk_id`, `syllabus_item_id`),
	FOREIGN KEY (`chunk_id`) REFERENCES `reference_chunks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunk_syllabus_item_idx` ON `chunk_syllabus_items` (`syllabus_item_id`);--> statement-breakpoint
CREATE TABLE `coverage_history` (
	`syllabus_item_id` text PRIMARY KEY NOT NULL,
	`times_assessed` integer DEFAULT 0 NOT NULL,
	`times_selected` integer DEFAULT 0 NOT NULL,
	`last_assessed_at` integer,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exam_syllabus_items` (
	`exam_id` text NOT NULL,
	`syllabus_item_id` text NOT NULL,
	PRIMARY KEY(`exam_id`, `syllabus_item_id`),
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`title` text NOT NULL,
	`total_marks` integer DEFAULT 100 NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`progress_json` text DEFAULT '{}' NOT NULL,
	`blueprint_json` text DEFAULT 'null',
	`generation_metadata_json` text DEFAULT '{}' NOT NULL,
	`unassessed_items_json` text DEFAULT '[]' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_group_id` text NOT NULL,
	`region` text NOT NULL,
	`text` text NOT NULL,
	`occurrence` integer DEFAULT 0 NOT NULL,
	`colour` text DEFAULT 'yellow' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_group_id`) REFERENCES `question_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `highlights_attempt_idx` ON `highlights` (`attempt_id`,`question_group_id`);--> statement-breakpoint
CREATE TABLE `question_fingerprints` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`question_group_id` text NOT NULL,
	`archetype_id` text,
	`scenario_domain` text NOT NULL,
	`syllabus_item_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_fingerprints_created_idx` ON `question_fingerprints` (`created_at`);--> statement-breakpoint
CREATE TABLE `question_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`position` integer NOT NULL,
	`total_marks` integer NOT NULL,
	`section` text NOT NULL,
	`stimulus_json` text DEFAULT 'null',
	`layout` text DEFAULT 'single' NOT NULL,
	`cognitive_demand` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_groups_exam_idx` ON `question_groups` (`exam_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_groups_position_idx` ON `question_groups` (`exam_id`,`position`);--> statement-breakpoint
CREATE TABLE `question_part_syllabus_items` (
	`question_part_id` text NOT NULL,
	`syllabus_item_id` text NOT NULL,
	PRIMARY KEY(`question_part_id`, `syllabus_item_id`),
	FOREIGN KEY (`question_part_id`) REFERENCES `question_parts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_part_syllabus_item_idx` ON `question_part_syllabus_items` (`syllabus_item_id`);--> statement-breakpoint
CREATE TABLE `question_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_group_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text,
	`renderer_type` text NOT NULL,
	`marks` integer NOT NULL,
	`prompt` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`answer_key_json` text DEFAULT 'null',
	`marking_guideline_json` text DEFAULT 'null',
	FOREIGN KEY (`question_group_id`) REFERENCES `question_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_parts_group_idx` ON `question_parts` (`question_group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_parts_position_idx` ON `question_parts` (`question_group_id`,`position`);--> statement-breakpoint
CREATE TABLE `reference_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`page_or_slide` text,
	`focus_area` text,
	`content` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `reference_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reference_chunks_source_idx` ON `reference_chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `reference_chunks_focus_idx` ON `reference_chunks` (`focus_area`);--> statement-breakpoint
CREATE TABLE `reference_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`file_path` text NOT NULL,
	`title` text NOT NULL,
	`focus_area` text,
	`ingested_at` integer NOT NULL,
	`byte_size` integer,
	`content_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_sources_path_idx` ON `reference_sources` (`file_path`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_part_id` text NOT NULL,
	`response_json` text DEFAULT 'null',
	`flagged` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`awarded_marks` integer,
	`marking_json` text DEFAULT 'null',
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_part_id`) REFERENCES `question_parts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_attempt_part_idx` ON `responses` (`attempt_id`,`question_part_id`);--> statement-breakpoint
CREATE INDEX `responses_attempt_idx` ON `responses` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `syllabus_items` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`level` text NOT NULL,
	`focus_area` text NOT NULL,
	`exact_text` text NOT NULL,
	`including_json` text DEFAULT '[]' NOT NULL,
	`sort_order` integer NOT NULL,
	`selectable` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`note` text,
	`source_url` text
);
--> statement-breakpoint
CREATE INDEX `syllabus_items_parent_idx` ON `syllabus_items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `syllabus_items_focus_idx` ON `syllabus_items` (`focus_area`);