CREATE TABLE `filter_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`description` text,
	`requires_text` integer DEFAULT false NOT NULL,
	`text_prompt` text,
	`auto_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`origin` text DEFAULT 'user' NOT NULL,
	`origin_ref` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `filter_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`answer` text,
	`text` text,
	`auto_answer` text,
	`auto_evidence` text,
	`auto_checked_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `filter_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filter_results_stock_item_uq` ON `filter_results` (`stock_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`date` text NOT NULL,
	`price` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prices_stock_date_idx` ON `prices` (`stock_id`,`date`);--> statement-breakpoint
CREATE TABLE `principle_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `principle_versions_version_unique` ON `principle_versions` (`version`);--> statement-breakpoint
CREATE TABLE `principles` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stage_transitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`gate_failures` text DEFAULT '[]' NOT NULL,
	`bypass_reason` text,
	`reject_reason` text,
	`sell_reason_type` text,
	`sell_reason_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stage_transitions_stock_idx` ON `stage_transitions` (`stock_id`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market` text NOT NULL,
	`ticker` text,
	`name` text,
	`currency` text NOT NULL,
	`industry` text,
	`corp_code` text,
	`cik` text,
	`stage` text DEFAULT 'idea' NOT NULL,
	`stage_changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`discovery_source` text DEFAULT 'other' NOT NULL,
	`discovery_source_note` text,
	`note` text,
	`watch_low` real,
	`watch_high` real,
	`rejected_from_stage` text,
	`reject_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocks_market_ticker_uq` ON `stocks` (`market`,`ticker`);--> statement-breakpoint
CREATE INDEX `stocks_stage_idx` ON `stocks` (`stage`);