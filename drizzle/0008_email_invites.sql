CREATE TABLE "meetup_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meetup_id" uuid NOT NULL,
	"invited_by" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetup_invite" ADD CONSTRAINT "meetup_invite_member_fk" FOREIGN KEY ("meetup_id","invited_by") REFERENCES "public"."meetup_member"("meetup_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetup_invite_email_idx" ON "meetup_invite" USING btree ("meetup_id","email","created_at");--> statement-breakpoint
CREATE INDEX "meetup_invite_sender_idx" ON "meetup_invite" USING btree ("invited_by","created_at");