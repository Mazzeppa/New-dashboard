CREATE TABLE `valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_id` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`stock_id`) REFERENCES `stocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `valuations_stock_id_unique` ON `valuations` (`stock_id`);