CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"base_url" text,
	"api_key" text,
	"model" text,
	"model_by_stage_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generation_provider" text,
	"marking_provider" text,
	"last_test_json" jsonb DEFAULT 'null'::jsonb,
	"updated_at" timestamp with time zone,
	"updated_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "archetypes" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"renderer_type" text NOT NULL,
	"stimulus_type" text,
	"typical_marks_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"command_verbs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cognitive_demand" text NOT NULL,
	"multipart" boolean DEFAULT false NOT NULL,
	"transformation_pattern" text,
	"marking_structure" text,
	"topic_suitability_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_syllabus_items" (
	"asset_id" text NOT NULL,
	"syllabus_item_id" text NOT NULL,
	CONSTRAINT "asset_syllabus_items_asset_id_syllabus_item_id_pk" PRIMARY KEY("asset_id","syllabus_item_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_filename" text NOT NULL,
	"byte_size" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"alt_text" text NOT NULL,
	"licence" text NOT NULL,
	"captions_extension" text,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_flags" (
	"attempt_id" text NOT NULL,
	"question_group_id" text NOT NULL,
	CONSTRAINT "attempt_flags_attempt_id_question_group_id_pk" PRIMARY KEY("attempt_id","question_group_id")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"user_id" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reading_started_at" timestamp with time zone,
	"working_started_at" timestamp with time zone,
	"working_expires_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"final_score" integer,
	"marking_status" text DEFAULT 'pending' NOT NULL,
	"marking_error" text,
	"ui_state_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk_syllabus_items" (
	"chunk_id" text NOT NULL,
	"syllabus_item_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "chunk_syllabus_items_chunk_id_syllabus_item_id_pk" PRIMARY KEY("chunk_id","syllabus_item_id")
);
--> statement-breakpoint
CREATE TABLE "coverage_history" (
	"syllabus_item_id" text PRIMARY KEY NOT NULL,
	"times_assessed" integer DEFAULT 0 NOT NULL,
	"times_selected" integer DEFAULT 0 NOT NULL,
	"last_assessed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_syllabus_items" (
	"exam_id" text NOT NULL,
	"syllabus_item_id" text NOT NULL,
	CONSTRAINT "exam_syllabus_items_exam_id_syllabus_item_id_pk" PRIMARY KEY("exam_id","syllabus_item_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"total_marks" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"progress_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blueprint_json" jsonb DEFAULT 'null'::jsonb,
	"generation_metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unassessed_items_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_group_id" text NOT NULL,
	"region" text NOT NULL,
	"text" text NOT NULL,
	"occurrence" integer DEFAULT 0 NOT NULL,
	"colour" text DEFAULT 'yellow' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_fingerprints" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"question_group_id" text NOT NULL,
	"archetype_id" text,
	"scenario_domain" text NOT NULL,
	"syllabus_item_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"position" integer NOT NULL,
	"total_marks" integer NOT NULL,
	"section" text NOT NULL,
	"stimulus_json" jsonb DEFAULT 'null'::jsonb,
	"layout" text DEFAULT 'single' NOT NULL,
	"cognitive_demand" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_part_syllabus_items" (
	"question_part_id" text NOT NULL,
	"syllabus_item_id" text NOT NULL,
	CONSTRAINT "question_part_syllabus_items_question_part_id_syllabus_item_id_pk" PRIMARY KEY("question_part_id","syllabus_item_id")
);
--> statement-breakpoint
CREATE TABLE "question_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"question_group_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text,
	"renderer_type" text NOT NULL,
	"marks" integer NOT NULL,
	"prompt" text NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answer_key_json" jsonb DEFAULT 'null'::jsonb,
	"marking_guideline_json" jsonb DEFAULT 'null'::jsonb
);
--> statement-breakpoint
CREATE TABLE "reference_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_or_slide" text,
	"focus_area" text,
	"content" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"file_path" text NOT NULL,
	"title" text NOT NULL,
	"focus_area" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"byte_size" integer,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_part_id" text NOT NULL,
	"response_json" jsonb DEFAULT 'null'::jsonb,
	"flagged" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"awarded_marks" integer,
	"marking_json" jsonb DEFAULT 'null'::jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_items" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"level" text NOT NULL,
	"focus_area" text NOT NULL,
	"exact_text" text NOT NULL,
	"including_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"selectable" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"note" text,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"username_lower" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_signed_in_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_syllabus_items" ADD CONSTRAINT "asset_syllabus_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_flags" ADD CONSTRAINT "attempt_flags_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_flags" ADD CONSTRAINT "attempt_flags_question_group_id_question_groups_id_fk" FOREIGN KEY ("question_group_id") REFERENCES "public"."question_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_syllabus_items" ADD CONSTRAINT "chunk_syllabus_items_chunk_id_reference_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."reference_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_syllabus_items" ADD CONSTRAINT "chunk_syllabus_items_syllabus_item_id_syllabus_items_id_fk" FOREIGN KEY ("syllabus_item_id") REFERENCES "public"."syllabus_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_history" ADD CONSTRAINT "coverage_history_syllabus_item_id_syllabus_items_id_fk" FOREIGN KEY ("syllabus_item_id") REFERENCES "public"."syllabus_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_syllabus_items" ADD CONSTRAINT "exam_syllabus_items_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_syllabus_items" ADD CONSTRAINT "exam_syllabus_items_syllabus_item_id_syllabus_items_id_fk" FOREIGN KEY ("syllabus_item_id") REFERENCES "public"."syllabus_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_question_group_id_question_groups_id_fk" FOREIGN KEY ("question_group_id") REFERENCES "public"."question_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_fingerprints" ADD CONSTRAINT "question_fingerprints_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_part_syllabus_items" ADD CONSTRAINT "question_part_syllabus_items_question_part_id_question_parts_id_fk" FOREIGN KEY ("question_part_id") REFERENCES "public"."question_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_part_syllabus_items" ADD CONSTRAINT "question_part_syllabus_items_syllabus_item_id_syllabus_items_id_fk" FOREIGN KEY ("syllabus_item_id") REFERENCES "public"."syllabus_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_parts" ADD CONSTRAINT "question_parts_question_group_id_question_groups_id_fk" FOREIGN KEY ("question_group_id") REFERENCES "public"."question_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_chunks" ADD CONSTRAINT "reference_chunks_source_id_reference_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."reference_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_part_id_question_parts_id_fk" FOREIGN KEY ("question_part_id") REFERENCES "public"."question_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_kind_idx" ON "assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "attempts_exam_idx" ON "attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "chunk_syllabus_item_idx" ON "chunk_syllabus_items" USING btree ("syllabus_item_id");--> statement-breakpoint
CREATE INDEX "highlights_attempt_idx" ON "highlights" USING btree ("attempt_id","question_group_id");--> statement-breakpoint
CREATE INDEX "question_fingerprints_created_idx" ON "question_fingerprints" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "question_groups_exam_idx" ON "question_groups" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_groups_position_idx" ON "question_groups" USING btree ("exam_id","position");--> statement-breakpoint
CREATE INDEX "question_part_syllabus_item_idx" ON "question_part_syllabus_items" USING btree ("syllabus_item_id");--> statement-breakpoint
CREATE INDEX "question_parts_group_idx" ON "question_parts" USING btree ("question_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_parts_position_idx" ON "question_parts" USING btree ("question_group_id","position");--> statement-breakpoint
CREATE INDEX "reference_chunks_source_idx" ON "reference_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "reference_chunks_focus_idx" ON "reference_chunks" USING btree ("focus_area");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_sources_path_idx" ON "reference_sources" USING btree ("file_path");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_attempt_part_idx" ON "responses" USING btree ("attempt_id","question_part_id");--> statement-breakpoint
CREATE INDEX "responses_attempt_idx" ON "responses" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "syllabus_items_parent_idx" ON "syllabus_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "syllabus_items_focus_idx" ON "syllabus_items" USING btree ("focus_area");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree ("username_lower");