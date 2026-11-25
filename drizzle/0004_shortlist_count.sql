ALTER TABLE "meetup" ADD COLUMN "shortlist_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "meetup" SET "shortlist_count" = (SELECT count(*) FROM "shortlist_item" WHERE "shortlist_item"."meetup_id" = "meetup"."id");
