CREATE TABLE `holding_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`review_date` text NOT NULL,
	`memo_id` integer,
	`theses` text NOT NULL,
	`conditions` text NOT NULL,
	`catalysts` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`price` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `holding_reviews_stock_idx` ON `holding_reviews` (`stock_id`);--> statement-breakpoint
CREATE TABLE `mistake_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`builtin` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mistake_tags_name_unique` ON `mistake_tags` (`name`);--> statement-breakpoint
CREATE TABLE `retrospective_tags` (
	`retrospective_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `mistake_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retrospective_tags_uq` ON `retrospective_tags` (`retrospective_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `retrospectives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`memo_id` integer,
	`outcome` text NOT NULL,
	`process` text NOT NULL,
	`return_pct` real,
	`what_happened` text NOT NULL,
	`thesis_review` text DEFAULT '' NOT NULL,
	`lessons` text DEFAULT '' NOT NULL,
	`applied_lessons` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `retrospectives_stock_idx` ON `retrospectives` (`stock_id`);