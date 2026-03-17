export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      blog_posts: {
        Row: {
          author: string
          author_name: string | null
          categories: string[] | null
          category: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          featured_image: string | null
          id: string
          image_url: string | null
          meta_description: string | null
          meta_title: string | null
          published: boolean | null
          published_at: string | null
          read_time: number | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          author?: string
          author_name?: string | null
          categories?: string[] | null
          category?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published?: boolean | null
          published_at?: string | null
          read_time?: number | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          author?: string
          author_name?: string | null
          categories?: string[] | null
          category?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published?: boolean | null
          published_at?: string | null
          read_time?: number | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          banner_url: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string
          founded_date: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          member_count: number | null
          name: string
          slug: string
          social_links: Json | null
          tags: string[] | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          banner_url?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          founded_date?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          member_count?: number | null
          name: string
          slug: string
          social_links?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          banner_url?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          founded_date?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          member_count?: number | null
          name?: string
          slug?: string
          social_links?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      defi_advocates: {
        Row: {
          achievements: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          email: string | null
          expertise: string | null
          github_url: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          linkedin_url: string | null
          location: string | null
          name: string
          slug: string
          specializations: string[] | null
          track: Database["public"]["Enums"]["advocate_track"] | null
          twitter_url: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          achievements?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          email?: string | null
          expertise?: string | null
          github_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          name: string
          slug: string
          specializations?: string[] | null
          track?: Database["public"]["Enums"]["advocate_track"] | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          achievements?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          email?: string | null
          expertise?: string | null
          github_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          name?: string
          slug?: string
          specializations?: string[] | null
          track?: Database["public"]["Enums"]["advocate_track"] | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      contact_forms: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string | null
          email: string
          id: string
          message: string
          metadata: Json | null
          name: string
          phone: string | null
          priority: Database["public"]["Enums"]["contact_priority"]
          resolved_at: string | null
          response_message: string | null
          response_sent_at: string | null
          source: Database["public"]["Enums"]["contact_source"]
          status: Database["public"]["Enums"]["contact_status"]
          subject: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          email: string
          id?: string
          message: string
          metadata?: Json | null
          name: string
          phone?: string | null
          priority?: Database["public"]["Enums"]["contact_priority"]
          resolved_at?: string | null
          response_message?: string | null
          response_sent_at?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          status?: Database["public"]["Enums"]["contact_status"]
          subject: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          metadata?: Json | null
          name?: string
          phone?: string | null
          priority?: Database["public"]["Enums"]["contact_priority"]
          resolved_at?: string | null
          response_message?: string | null
          response_sent_at?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          status?: Database["public"]["Enums"]["contact_status"]
          subject?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_forms_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          accessibility_needs: string | null
          attendance_duration_minutes: number | null
          certificate_issued: boolean | null
          certificate_issued_at: string | null
          check_in_time: string | null
          company: string | null
          confirmation_sent_at: string | null
          created_at: string | null
          dietary_restrictions: string | null
          email: string
          emergency_contact: string | null
          emergency_phone: string | null
          event_id: string
          expectations: string | null
          feedback_comments: string | null
          feedback_rating: number | null
          how_did_you_hear: string | null
          id: string
          job_title: string | null
          marketing_opt_in: boolean | null
          metadata: Json | null
          name: string
          networking_opt_in: boolean | null
          phone: string | null
          registration_date: string | null
          reminder_sent_at: string | null
          status: Database["public"]["Enums"]["registration_status"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          attendance_duration_minutes?: number | null
          certificate_issued?: boolean | null
          certificate_issued_at?: string | null
          check_in_time?: string | null
          company?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          dietary_restrictions?: string | null
          email: string
          emergency_contact?: string | null
          emergency_phone?: string | null
          event_id: string
          expectations?: string | null
          feedback_comments?: string | null
          feedback_rating?: number | null
          how_did_you_hear?: string | null
          id?: string
          job_title?: string | null
          marketing_opt_in?: boolean | null
          metadata?: Json | null
          name: string
          networking_opt_in?: boolean | null
          phone?: string | null
          registration_date?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          attendance_duration_minutes?: number | null
          certificate_issued?: boolean | null
          certificate_issued_at?: string | null
          check_in_time?: string | null
          company?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          dietary_restrictions?: string | null
          email?: string
          emergency_contact?: string | null
          emergency_phone?: string | null
          event_id?: string
          expectations?: string | null
          feedback_comments?: string | null
          feedback_rating?: number | null
          how_did_you_hear?: string | null
          id?: string
          job_title?: string | null
          marketing_opt_in?: boolean | null
          metadata?: Json | null
          name?: string
          networking_opt_in?: boolean | null
          phone?: string | null
          registration_date?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      event_speakers: {
        Row: {
          bio: string | null
          company: string | null
          created_at: string | null
          event_id: string | null
          id: string
          image_url: string | null
          linkedin_url: string | null
          name: string
          role: string | null
          topic: string | null
          twitter_url: string | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          image_url?: string | null
          linkedin_url?: string | null
          name: string
          role?: string | null
          topic?: string | null
          twitter_url?: string | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          image_url?: string | null
          linkedin_url?: string | null
          name?: string
          role?: string | null
          topic?: string | null
          twitter_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_old"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          current_attendees: number | null
          date: string
          description: string
          id: string
          image_url: string | null
          location: string
          location_url: string | null
          max_attendees: number | null
          registration_url: string | null
          slug: string | null
          speakers: string[] | null
          status: string | null
          tags: string[] | null
          time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_attendees?: number | null
          date: string
          description: string
          id?: string
          image_url?: string | null
          location: string
          location_url?: string | null
          max_attendees?: number | null
          registration_url?: string | null
          slug?: string | null
          speakers?: string[] | null
          status?: string | null
          tags?: string[] | null
          time: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_attendees?: number | null
          date?: string
          description?: string
          id?: string
          image_url?: string | null
          location?: string
          location_url?: string | null
          max_attendees?: number | null
          registration_url?: string | null
          slug?: string | null
          speakers?: string[] | null
          status?: string | null
          tags?: string[] | null
          time?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      events_old: {
        Row: {
          address: string | null
          banner_image: string | null
          capacity: number | null
          city: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          event_type: string | null
          id: string
          is_online: boolean | null
          meeting_url: string | null
          price: number | null
          registration_url: string | null
          requires_registration: boolean | null
          slug: string
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
          venue_name: string | null
        }
        Insert: {
          address?: string | null
          banner_image?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          is_online?: boolean | null
          meeting_url?: string | null
          price?: number | null
          registration_url?: string | null
          requires_registration?: boolean | null
          slug: string
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
          venue_name?: string | null
        }
        Update: {
          address?: string | null
          banner_image?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          is_online?: boolean | null
          meeting_url?: string | null
          price?: number | null
          registration_url?: string | null
          requires_registration?: boolean | null
          slug?: string
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          venue_name?: string | null
        }
        Relationships: []
      }
      founders: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          image_url: string | null
          linkedin_url: string | null
          name: string
          role: string | null
          startup_id: string | null
          twitter_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          linkedin_url?: string | null
          name: string
          role?: string | null
          startup_id?: string | null
          twitter_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          linkedin_url?: string | null
          name?: string
          role?: string | null
          startup_id?: string | null
          twitter_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "founders_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          correlation_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown | null
          level: Database["public"]["Enums"]["log_level"] | null
          message: string | null
          metadata: Json | null
          referer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown | null
          level?: Database["public"]["Enums"]["log_level"] | null
          message?: string | null
          metadata?: Json | null
          referer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown | null
          level?: Database["public"]["Enums"]["log_level"] | null
          message?: string | null
          metadata?: Json | null
          referer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          bounce_count: number | null
          click_count: number | null
          complaint_count: number | null
          confirmed_at: string | null
          created_at: string | null
          email: string
          engagement_score: number | null
          id: string
          interests: string[] | null
          last_email_sent: string | null
          metadata: Json | null
          name: string | null
          open_count: number | null
          source: Database["public"]["Enums"]["newsletter_source"]
          status: Database["public"]["Enums"]["newsletter_status"]
          subscribed_at: string | null
          unsubscribe_reason: string | null
          unsubscribed_at: string | null
          updated_at: string | null
        }
        Insert: {
          bounce_count?: number | null
          click_count?: number | null
          complaint_count?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          email: string
          engagement_score?: number | null
          id?: string
          interests?: string[] | null
          last_email_sent?: string | null
          metadata?: Json | null
          name?: string | null
          open_count?: number | null
          source?: Database["public"]["Enums"]["newsletter_source"]
          status?: Database["public"]["Enums"]["newsletter_status"]
          subscribed_at?: string | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          bounce_count?: number | null
          click_count?: number | null
          complaint_count?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string
          engagement_score?: number | null
          id?: string
          interests?: string[] | null
          last_email_sent?: string | null
          metadata?: Json | null
          name?: string | null
          open_count?: number | null
          source?: Database["public"]["Enums"]["newsletter_source"]
          status?: Database["public"]["Enums"]["newsletter_status"]
          subscribed_at?: string | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          active_communities: number | null
          created_at: string | null
          draft_posts: number | null
          featured_startups: number | null
          id: string
          last_blog_update: string | null
          last_community_update: string | null
          last_event_update: string | null
          last_startup_update: string | null
          published_posts: number | null
          total_blog_posts: number | null
          total_communities: number | null
          total_events: number | null
          total_members: number | null
          total_startups: number | null
          upcoming_events: number | null
          updated_at: string | null
        }
        Insert: {
          active_communities?: number | null
          created_at?: string | null
          draft_posts?: number | null
          featured_startups?: number | null
          id?: string
          last_blog_update?: string | null
          last_community_update?: string | null
          last_event_update?: string | null
          last_startup_update?: string | null
          published_posts?: number | null
          total_blog_posts?: number | null
          total_communities?: number | null
          total_events?: number | null
          total_members?: number | null
          total_startups?: number | null
          upcoming_events?: number | null
          updated_at?: string | null
        }
        Update: {
          active_communities?: number | null
          created_at?: string | null
          draft_posts?: number | null
          featured_startups?: number | null
          id?: string
          last_blog_update?: string | null
          last_community_update?: string | null
          last_event_update?: string | null
          last_startup_update?: string | null
          published_posts?: number | null
          total_blog_posts?: number | null
          total_communities?: number | null
          total_events?: number | null
          total_members?: number | null
          total_startups?: number | null
          upcoming_events?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      startup_applications: {
        Row: {
          additional_info: string | null
          business_model: string
          co_founders: string | null
          competitive_advantage: string
          created_at: string | null
          decision_deadline: string | null
          demo_url: string | null
          description: string
          follow_up_date: string | null
          founder_email: string
          founder_name: string
          funding_amount_sought: number | null
          funding_stage: Database["public"]["Enums"]["funding_stage"]
          github_url: string | null
          id: string
          industry: string
          interview_scheduled_at: string | null
          linkedin_profile: string | null
          location: string
          metadata: Json | null
          pitch_deck_url: string | null
          problem_statement: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_feedback: Json | null
          score: number | null
          solution: string
          startup_name: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          tags: string[] | null
          target_market: string
          team_size: number | null
          technology_stack: string | null
          traction: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          additional_info?: string | null
          business_model: string
          co_founders?: string | null
          competitive_advantage: string
          created_at?: string | null
          decision_deadline?: string | null
          demo_url?: string | null
          description: string
          follow_up_date?: string | null
          founder_email: string
          founder_name: string
          funding_amount_sought?: number | null
          funding_stage: Database["public"]["Enums"]["funding_stage"]
          github_url?: string | null
          id?: string
          industry: string
          interview_scheduled_at?: string | null
          linkedin_profile?: string | null
          location: string
          metadata?: Json | null
          pitch_deck_url?: string | null
          problem_statement: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_feedback?: Json | null
          score?: number | null
          solution: string
          startup_name: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          tags?: string[] | null
          target_market: string
          team_size?: number | null
          technology_stack?: string | null
          traction: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          additional_info?: string | null
          business_model?: string
          co_founders?: string | null
          competitive_advantage?: string
          created_at?: string | null
          decision_deadline?: string | null
          demo_url?: string | null
          description?: string
          follow_up_date?: string | null
          founder_email?: string
          founder_name?: string
          funding_amount_sought?: number | null
          funding_stage?: Database["public"]["Enums"]["funding_stage"]
          github_url?: string | null
          id?: string
          industry?: string
          interview_scheduled_at?: string | null
          linkedin_profile?: string | null
          location?: string
          metadata?: Json | null
          pitch_deck_url?: string | null
          problem_statement?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_feedback?: Json | null
          score?: number | null
          solution?: string
          startup_name?: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          tags?: string[] | null
          target_market?: string
          team_size?: number | null
          technology_stack?: string | null
          traction?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      startups: {
        Row: {
          active_users: number | null
          categories: string[] | null
          created_at: string | null
          description: string | null
          discord_url: string | null
          docs_url: string | null
          featured: boolean | null
          founded_year: number | null
          github_url: string | null
          id: string
          logo_url: string | null
          long_description: string | null
          medium_url: string | null
          name: string
          slug: string
          status: string | null
          telegram_url: string | null
          token_symbol: string | null
          total_transactions: number | null
          tvl: number | null
          twitter_url: string | null
          updated_at: string | null
          volume_24h: number | null
          website: string | null
        }
        Insert: {
          active_users?: number | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          discord_url?: string | null
          docs_url?: string | null
          featured?: boolean | null
          founded_year?: number | null
          github_url?: string | null
          id?: string
          logo_url?: string | null
          long_description?: string | null
          medium_url?: string | null
          name: string
          slug: string
          status?: string | null
          telegram_url?: string | null
          token_symbol?: string | null
          total_transactions?: number | null
          tvl?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website?: string | null
        }
        Update: {
          active_users?: number | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          discord_url?: string | null
          docs_url?: string | null
          featured?: boolean | null
          founded_year?: number | null
          github_url?: string | null
          id?: string
          logo_url?: string | null
          long_description?: string | null
          medium_url?: string | null
          name?: string
          slug?: string
          status?: string | null
          telegram_url?: string | null
          token_symbol?: string | null
          total_transactions?: number | null
          tvl?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          permissions: Json | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      followed_wallets: {
        Row: {
          id: string
          user_id: string
          wallet_address: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          wallet_address: string
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          wallet_address?: string
          label?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_by_email: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          metadata: Json | null
          permissions: Json | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "reviewer_workload"
            referencedColumns: ["reviewer_id"]
          },
        ]
      }
      contact_form_analytics: {
        Row: {
          avg_resolution_time_hours: number | null
          date: string | null
          high_priority_count: number | null
          pending_count: number | null
          resolved_count: number | null
          total_forms: number | null
          unique_contacts: number | null
          urgent_count: number | null
        }
        Relationships: []
      }
      event_attendance_analytics: {
        Row: {
          attendance_rate: number | null
          attended_count: number | null
          avg_rating: number | null
          companies_count: number | null
          confirmed_count: number | null
          event_date: string | null
          event_id: string | null
          event_title: string | null
          max_attendees: number | null
          no_show_count: number | null
          total_registrations: number | null
        }
        Relationships: []
      }
      reviewer_workload: {
        Row: {
          avg_review_time_days: number | null
          avg_score_given: number | null
          completed: number | null
          in_review: number | null
          reviewer_email: string | null
          reviewer_id: string | null
          total_assigned: number | null
        }
        Relationships: []
      }
      startup_application_pipeline: {
        Row: {
          avg_days_in_stage: number | null
          count: number | null
          newest_application: string | null
          oldest_application: string | null
          status: Database["public"]["Enums"]["application_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_application_reviewer: {
        Args: { application_id: string; reviewer_id: string }
        Returns: boolean
      }
      assign_user_role: {
        Args: {
          target_user_id: string
          new_role: Database["public"]["Enums"]["user_role"]
          assigned_by_user_id?: string
          expires_at_param?: string
          permissions_param?: Json
        }
        Returns: string
      }
      bulk_update_application_status: {
        Args: {
          application_ids: string[]
          new_status: Database["public"]["Enums"]["application_status"]
          review_notes_text?: string
        }
        Returns: number
      }
      check_event_capacity: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      check_in_attendee: {
        Args: { registration_id: string; check_in_by?: string }
        Returns: boolean
      }
      cleanup_old_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      get_applications_needing_review: {
        Args: { reviewer_id?: string; limit_count?: number }
        Returns: {
          id: string
          startup_name: string
          founder_name: string
          industry: string
          funding_stage: Database["public"]["Enums"]["funding_stage"]
          submitted_at: string
          days_pending: number
        }[]
      }
      get_contact_form_stats: {
        Args: { days_back?: number }
        Returns: Json
      }
      get_event_registration_stats: {
        Args: { target_event_id: string }
        Returns: Json
      }
      get_log_analytics: {
        Args: { start_date?: string; end_date?: string }
        Returns: Json
      }
      get_newsletter_stats: {
        Args: { days_back?: number }
        Returns: Json
      }
      get_startup_application_stats: {
        Args: { days_back?: number }
        Returns: Json
      }
      get_user_role: {
        Args: { user_uuid?: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      log_event: {
        Args: {
          p_event_type: string
          p_event_data?: Json
          p_level?: Database["public"]["Enums"]["log_level"]
          p_message?: string
          p_user_id?: string
          p_correlation_id?: string
          p_duration_ms?: number
          p_error_details?: Json
          p_metadata?: Json
        }
        Returns: string
      }
      register_for_event: {
        Args: {
          target_event_id: string
          registrant_name: string
          registrant_email: string
          registrant_phone?: string
          registrant_company?: string
          additional_info?: Json
        }
        Returns: string
      }
      score_application: {
        Args: {
          application_id: string
          application_score: number
          feedback_notes?: string
        }
        Returns: boolean
      }
      send_registration_reminders: {
        Args: { target_event_id: string; hours_before_event?: number }
        Returns: number
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      track_email_event: {
        Args: {
          subscriber_email: string
          event_type: string
          campaign_id?: string
        }
        Returns: boolean
      }
      update_platform_stats: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      user_has_permission: {
        Args: { permission_name: string; user_uuid?: string }
        Returns: boolean
      }
      user_has_role: {
        Args: {
          required_role: Database["public"]["Enums"]["user_role"]
          user_uuid?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      advocate_track:
        | "developer_expert"
        | "community_advocate"
        | "researcher"
        | "educator"
        | "influencer"
      application_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "waitlisted"
      contact_priority: "low" | "medium" | "high" | "urgent"
      contact_source: "website" | "social" | "referral" | "event" | "other"
      contact_status: "pending" | "in_progress" | "resolved" | "closed"
      funding_stage:
        | "pre_seed"
        | "seed"
        | "series_a"
        | "series_b"
        | "later"
        | "bootstrap"
      log_level: "debug" | "info" | "warn" | "error" | "fatal"
      newsletter_source: "website" | "event" | "social" | "referral" | "import"
      newsletter_status: "active" | "unsubscribed" | "bounced" | "complained"
      registration_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "attended"
        | "no_show"
      user_role: "user" | "moderator" | "admin" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      advocate_track: [
        "developer_expert",
        "community_advocate",
        "researcher",
        "educator",
        "influencer",
      ],
      application_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "waitlisted",
      ],
      contact_priority: ["low", "medium", "high", "urgent"],
      contact_source: ["website", "social", "referral", "event", "other"],
      contact_status: ["pending", "in_progress", "resolved", "closed"],
      funding_stage: [
        "pre_seed",
        "seed",
        "series_a",
        "series_b",
        "later",
        "bootstrap",
      ],
      log_level: ["debug", "info", "warn", "error", "fatal"],
      newsletter_source: ["website", "event", "social", "referral", "import"],
      newsletter_status: ["active", "unsubscribed", "bounced", "complained"],
      registration_status: [
        "pending",
        "confirmed",
        "cancelled",
        "attended",
        "no_show",
      ],
      user_role: ["user", "moderator", "admin", "super_admin"],
    },
  },
} as const
