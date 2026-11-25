CREATE TYPE "public"."meetup_phase" AS ENUM('planning', 'voting', 'decided');--> statement-breakpoint
CREATE TABLE "ballot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetup_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ranking" jsonb NOT NULL,
	CONSTRAINT "ballot_meetup_token_uq" UNIQUE("meetup_id","token_hash")
);
--> statement-breakpoint
CREATE TABLE "ballot_receipt" (
	"meetup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "ballot_receipt_meetup_id_user_id_pk" PRIMARY KEY("meetup_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shortlist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetup_id" uuid NOT NULL,
	"town_id" integer NOT NULL,
	"label" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"note" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_item_meetup_town_uq" UNIQUE("meetup_id","town_id")
);
--> statement-breakpoint
ALTER TABLE "meetup" ADD COLUMN "phase" "meetup_phase" DEFAULT 'planning' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetup" ADD COLUMN "voting_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetup" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetup" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_meetup_id_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."meetup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_receipt" ADD CONSTRAINT "ballot_receipt_meetup_id_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."meetup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_receipt" ADD CONSTRAINT "ballot_receipt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_item" ADD CONSTRAINT "shortlist_item_meetup_id_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."meetup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_item" ADD CONSTRAINT "shortlist_item_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;