CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"campaign_type" text NOT NULL,
	"email_template" text NOT NULL,
	"target_segment" text DEFAULT 'all',
	"target_conditions" json,
	"is_active" boolean DEFAULT true,
	"scheduled_at" timestamp,
	"send_after_days" integer,
	"trigger_event" text,
	"total_sent" integer DEFAULT 0,
	"total_delivered" integer DEFAULT 0,
	"total_opened" integer DEFAULT 0,
	"total_clicked" integer DEFAULT 0,
	"total_unsubscribed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"welcome_emails" boolean DEFAULT true,
	"reengagement_emails" boolean DEFAULT true,
	"feature_updates" boolean DEFAULT true,
	"product_tips" boolean DEFAULT true,
	"usage_insights" boolean DEFAULT true,
	"community_highlights" boolean DEFAULT false,
	"email_frequency" text DEFAULT 'weekly',
	"is_unsubscribed" boolean DEFAULT false,
	"unsubscribe_token" text,
	"unsubscribed_at" timestamp,
	"unsubscribe_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_preferences_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "email_send_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"campaign_id" integer,
	"email_type" text NOT NULL,
	"email_subject" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'sent',
	"resend_message_id" text,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounced_at" timestamp,
	"open_tracking_token" text,
	"click_tracking_token" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "email_send_log_open_tracking_token_unique" UNIQUE("open_tracking_token"),
	CONSTRAINT "email_send_log_click_tracking_token_unique" UNIQUE("click_tracking_token")
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"activity_data" json,
	"session_id" text,
	"user_agent" text,
	"ip_address" text,
	"duration" integer,
	"timestamp" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_engagement" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"last_login_at" timestamp,
	"total_logins" integer DEFAULT 0,
	"total_sessions" integer DEFAULT 0,
	"total_time_spent" integer DEFAULT 0,
	"files_uploaded" integer DEFAULT 0,
	"files_analyzed" integer DEFAULT 0,
	"chat_messages_count" integer DEFAULT 0,
	"ai_interactions" integer DEFAULT 0,
	"engagement_score" integer DEFAULT 0,
	"user_segment" text DEFAULT 'new',
	"timezone" text DEFAULT 'UTC',
	"preferred_contact_time" text DEFAULT 'morning',
	"first_session_at" timestamp DEFAULT now(),
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_log" ADD CONSTRAINT "email_send_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_log" ADD CONSTRAINT "email_send_log_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_engagement" ADD CONSTRAINT "user_engagement_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;