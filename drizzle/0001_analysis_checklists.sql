CREATE TABLE `analysis_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`section` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`score` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_sections_stock_section_uq` ON `analysis_sections` (`stock_id`,`section`);--> statement-breakpoint
CREATE TABLE `checklist_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_checklist_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`score` integer,
	`memo` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_checklist_id`) REFERENCES `stock_checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `checklist_template_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_answers_uq` ON `checklist_answers` (`stock_checklist_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `checklist_template_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`text` text NOT NULL,
	`help` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_items_tpl_idx` ON `checklist_template_items` (`template_id`);--> statement-breakpoint
CREATE TABLE `checklist_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`builtin` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financial_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`fiscal_year` integer NOT NULL,
	`fiscal_quarter` integer DEFAULT 0 NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`consolidated` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_values_uq` ON `financial_values` (`stock_id`,`fiscal_year`,`fiscal_quarter`,`metric`);--> statement-breakpoint
CREATE INDEX `financial_values_stock_idx` ON `financial_values` (`stock_id`);--> statement-breakpoint
CREATE TABLE `stock_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_checklists_uq` ON `stock_checklists` (`stock_id`,`template_id`);