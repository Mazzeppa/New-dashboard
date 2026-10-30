CREATE TABLE `dart_corps` (
	`corp_code` text PRIMARY KEY NOT NULL,
	`corp_name` text NOT NULL,
	`stock_code` text,
	`modify_date` text
);
--> statement-breakpoint
CREATE INDEX `dart_corps_stock_code_idx` ON `dart_corps` (`stock_code`);--> statement-breakpoint
CREATE TABLE `fetch_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`provider` text NOT NULL,
	`ok` integer NOT NULL,
	`message` text NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fetch_logs_stock_idx` ON `fetch_logs` (`stock_id`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sec_tickers` (
	`ticker` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `stocks` ADD `maintenance_capex_pct` real;