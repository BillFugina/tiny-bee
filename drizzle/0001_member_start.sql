ALTER TABLE "meetup_member" ADD COLUMN "start_town_id" integer;--> statement-breakpoint
ALTER TABLE "meetup_member" ADD COLUMN "start_label" text;--> statement-breakpoint
ALTER TABLE "meetup_member" ADD COLUMN "start_lat" double precision;--> statement-breakpoint
ALTER TABLE "meetup_member" ADD COLUMN "start_lng" double precision;--> statement-breakpoint
ALTER TABLE "meetup_member" ADD COLUMN "max_minutes" integer;