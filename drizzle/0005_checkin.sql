CREATE TYPE "public"."checkin_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."constraint_kind" AS ENUM('budget', 'food', 'accessibility', 'timing', 'travel', 'other');--> statement-breakpoint
CREATE TABLE "checkin_message" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meetup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "checkin_role" NOT NULL,
	"content" jsonb NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_constraint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "constraint_kind" NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetup_member" ADD COLUMN "checkin_busy_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkin_message" ADD CONSTRAINT "checkin_message_member_fk" FOREIGN KEY ("meetup_id","user_id") REFERENCES "public"."meetup_member"("meetup_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_constraint" ADD CONSTRAINT "member_constraint_member_fk" FOREIGN KEY ("meetup_id","user_id") REFERENCES "public"."meetup_member"("meetup_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_message_member_idx" ON "checkin_message" USING btree ("meetup_id","user_id","id");--> statement-breakpoint
CREATE INDEX "member_constraint_member_idx" ON "member_constraint" USING btree ("meetup_id","user_id");