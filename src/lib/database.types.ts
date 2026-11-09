// Hand-written in the shape of `supabase gen types typescript`. CI regenerates this file from the
// migrations and typechecks against it; run `npm run db:types` after linking to refresh locally.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          theme: Database['public']['Enums']['theme'];
          field_view: Database['public']['Enums']['field_view'];
          last_team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          theme?: Database['public']['Enums']['theme'];
          field_view?: Database['public']['Enums']['field_view'];
          last_team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          theme?: Database['public']['Enums']['theme'];
          field_view?: Database['public']['Enums']['field_view'];
          last_team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          sport: Database['public']['Enums']['sport'];
          owner_id: string;
          join_code: string;
          join_code_rotated_at: string;
          side_size: number;
          has_gk: boolean;
          periods_count: number;
          colors: Json;
          last_batter_player_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          sport: Database['public']['Enums']['sport'];
          owner_id: string;
          join_code: string;
          join_code_rotated_at?: string;
          side_size: number;
          has_gk?: boolean;
          periods_count: number;
          colors?: Json;
          last_batter_player_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          sport?: Database['public']['Enums']['sport'];
          owner_id?: string;
          join_code?: string;
          join_code_rotated_at?: string;
          side_size?: number;
          has_gk?: boolean;
          periods_count?: number;
          colors?: Json;
          last_batter_player_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          starts_on: string | null;
          ends_on: string | null;
          is_current: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          starts_on?: string | null;
          ends_on?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          name?: string;
          starts_on?: string | null;
          ends_on?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          requested_role: Database['public']['Enums']['member_role'] | null;
          note: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          requested_role?: Database['public']['Enums']['member_role'] | null;
          note?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          user_id?: string;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          requested_role?: Database['public']['Enums']['member_role'] | null;
          note?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          team_id: string;
          first_name: string;
          last_name: string | null;
          jersey_number: string | null;
          is_available: boolean;
          batting_order: number | null;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          first_name: string;
          last_name?: string | null;
          jersey_number?: string | null;
          is_available?: boolean;
          batting_order?: number | null;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string;
          first_name?: string;
          last_name?: string | null;
          jersey_number?: string | null;
          is_available?: boolean;
          batting_order?: number | null;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      player_guardians: {
        Row: {
          id: string;
          player_id: string;
          user_id: string;
          relationship: string | null;
          status: Database['public']['Enums']['guardian_status'];
          unlisted_child_name: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          user_id: string;
          relationship?: string | null;
          status?: Database['public']['Enums']['guardian_status'];
          unlisted_child_name?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          user_id?: string;
          relationship?: string | null;
          status?: Database['public']['Enums']['guardian_status'];
          unlisted_child_name?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      unlisted_child_requests: {
        Row: { id: string; member_id: string; child_name: string; created_at: string };
        Insert: { id?: string; member_id: string; child_name: string; created_at?: string };
        Update: { id?: string; member_id?: string; child_name?: string; created_at?: string };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          team_id: string;
          season_id: string;
          opponent: string;
          game_date: string;
          start_time: string | null;
          location: string | null;
          home_away: Database['public']['Enums']['home_away'] | null;
          parent_notes: string | null;
          status: Database['public']['Enums']['game_status'];
          team_name_snapshot: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          season_id: string;
          opponent?: string;
          game_date?: string;
          start_time?: string | null;
          location?: string | null;
          home_away?: Database['public']['Enums']['home_away'] | null;
          parent_notes?: string | null;
          status?: Database['public']['Enums']['game_status'];
          team_name_snapshot?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string;
          season_id?: string;
          opponent?: string;
          game_date?: string;
          start_time?: string | null;
          location?: string | null;
          home_away?: Database['public']['Enums']['home_away'] | null;
          parent_notes?: string | null;
          status?: Database['public']['Enums']['game_status'];
          team_name_snapshot?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      game_coach_notes: {
        Row: { game_id: string; notes: string; updated_at: string; updated_by: string | null };
        Insert: { game_id: string; notes?: string; updated_at?: string; updated_by?: string | null };
        Update: { game_id?: string; notes?: string; updated_at?: string; updated_by?: string | null };
        Relationships: [];
      };
      game_players: {
        Row: {
          game_id: string;
          player_id: string;
          name_snapshot: string;
          number_snapshot: string | null;
          available: boolean;
        };
        Insert: {
          game_id: string;
          player_id: string;
          name_snapshot: string;
          number_snapshot?: string | null;
          available?: boolean;
        };
        Update: {
          game_id?: string;
          player_id?: string;
          name_snapshot?: string;
          number_snapshot?: string | null;
          available?: boolean;
        };
        Relationships: [];
      };
      lineups: {
        Row: {
          id: string;
          team_id: string;
          game_id: string | null;
          period_index: number;
          formation_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          game_id?: string | null;
          period_index: number;
          formation_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          game_id?: string | null;
          period_index?: number;
          formation_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lineup_slots: {
        Row: {
          lineup_id: string;
          slot_index: number;
          position_role: string;
          position_code: string;
          player_id: string | null;
          auto_picked: boolean;
        };
        Insert: {
          lineup_id: string;
          slot_index: number;
          position_role: string;
          position_code: string;
          player_id?: string | null;
          auto_picked?: boolean;
        };
        Update: {
          lineup_id?: string;
          slot_index?: number;
          position_role?: string;
          position_code?: string;
          player_id?: string | null;
          auto_picked?: boolean;
        };
        Relationships: [];
      };
      score_events: {
        Row: {
          id: string;
          game_id: string;
          side: Database['public']['Enums']['score_side'];
          period_index: number;
          event_type: string;
          points: number;
          scorer_player_id: string | null;
          assist_player_id: string | null;
          occurred_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          side: Database['public']['Enums']['score_side'];
          period_index: number;
          event_type: string;
          points?: number;
          scorer_player_id?: string | null;
          assist_player_id?: string | null;
          occurred_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          game_id?: string;
          side?: Database['public']['Enums']['score_side'];
          period_index?: number;
          event_type?: string;
          points?: number;
          scorer_player_id?: string | null;
          assist_player_id?: string | null;
          occurred_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      plate_appearances: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          inning: number;
          sequence: number;
          result: Database['public']['Enums']['pa_result'];
          rbi: number;
          occurred_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          player_id: string;
          inning: number;
          sequence?: number;
          result?: Database['public']['Enums']['pa_result'];
          rbi?: number;
          occurred_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          game_id?: string;
          player_id?: string;
          inning?: number;
          sequence?: number;
          result?: Database['public']['Enums']['pa_result'];
          rbi?: number;
          occurred_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      skill_tests: {
        Row: {
          id: string;
          team_id: string;
          key: string;
          name: string;
          instructions: string;
          metric: Database['public']['Enums']['skill_metric'];
          unit: string | null;
          has_sides: boolean;
          higher_is_better: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          key: string;
          name: string;
          instructions?: string;
          metric: Database['public']['Enums']['skill_metric'];
          unit?: string | null;
          has_sides?: boolean;
          higher_is_better?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string;
          key?: string;
          name?: string;
          instructions?: string;
          metric?: Database['public']['Enums']['skill_metric'];
          unit?: string | null;
          has_sides?: boolean;
          higher_is_better?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      skill_results: {
        Row: {
          id: string;
          player_id: string;
          skill_test_id: string;
          tested_on: string;
          value: number;
          attempts: number | null;
          side: Database['public']['Enums']['body_side'] | null;
          note: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          player_id: string;
          skill_test_id: string;
          tested_on?: string;
          value: number;
          attempts?: number | null;
          side?: Database['public']['Enums']['body_side'] | null;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          player_id?: string;
          skill_test_id?: string;
          tested_on?: string;
          value?: number;
          attempts?: number | null;
          side?: Database['public']['Enums']['body_side'] | null;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      join_attempts: {
        Row: { id: number; user_id: string; code_tried: string; attempted_at: string };
        Insert: { id?: never; user_id: string; code_tried: string; attempted_at?: string };
        Update: { id?: never; user_id?: string; code_tried?: string; attempted_at?: string };
        Relationships: [];
      };
    };
    Views: {
      game_scores: {
        Row: { game_id: string | null; us: number | null; them: number | null };
        Relationships: [];
      };
      game_line_score: {
        Row: {
          game_id: string | null;
          period_index: number | null;
          side: Database['public']['Enums']['score_side'] | null;
          points: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_team: {
        Args: {
          p_name: string;
          p_sport: Database['public']['Enums']['sport'];
          p_side_size: number;
          p_has_gk: boolean;
          p_periods_count: number;
          p_colors: Json;
          p_template: Json;
          p_skill_tests?: Json;
        };
        Returns: string;
      };
      lookup_join_code: { Args: { p_code: string }; Returns: Json };
      request_join: {
        Args: {
          p_code: string;
          p_requested_role: Database['public']['Enums']['member_role'];
          p_player_ids?: string[];
          p_unlisted_child_name?: string;
        };
        Returns: Json;
      };
      request_guardian_link: { Args: { p_player_id: string; p_relationship?: string }; Returns: string };
      approve_member: {
        Args: { p_member_id: string; p_role: Database['public']['Enums']['member_role']; p_player_ids?: string[] };
        Returns: undefined;
      };
      decline_member: { Args: { p_member_id: string }; Returns: undefined };
      remove_member: { Args: { p_member_id: string }; Returns: undefined };
      set_member_role: {
        Args: { p_member_id: string; p_role: Database['public']['Enums']['member_role'] };
        Returns: undefined;
      };
      approve_guardian_link: { Args: { p_link_id: string; p_approve?: boolean }; Returns: undefined };
      rotate_join_code: { Args: { p_team_id: string }; Returns: string };
      transfer_ownership: { Args: { p_team_id: string; p_user_id: string }; Returns: undefined };
      start_game: { Args: { p_game_id: string }; Returns: undefined };
      finish_game: { Args: { p_game_id: string }; Returns: undefined };
      my_pending_requests: {
        Args: Record<PropertyKey, never>;
        Returns: {
          member_id: string;
          team_id: string;
          team_name: string;
          sport: Database['public']['Enums']['sport'];
          requested_role: Database['public']['Enums']['member_role'];
          created_at: string;
        }[];
      };
      list_team_members: {
        Args: { p_team_id: string };
        Returns: {
          member_id: string;
          user_id: string;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          requested_role: Database['public']['Enums']['member_role'] | null;
          display_name: string;
          email: string;
          is_owner: boolean;
          created_at: string;
          approved_at: string | null;
          children: Json;
          unlisted: Json;
        }[];
      };
      member_role_on: { Args: { p_team_id: string }; Returns: Database['public']['Enums']['member_role'] | null };
      is_active_member: { Args: { p_team_id: string }; Returns: boolean };
      is_staff: { Args: { p_team_id: string }; Returns: boolean };
      is_coach: { Args: { p_team_id: string }; Returns: boolean };
      is_owner: { Args: { p_team_id: string }; Returns: boolean };
      is_guardian_of: { Args: { p_player_id: string }; Returns: boolean };
      email_confirmed: { Args: { p_user_id: string }; Returns: boolean };
      team_of_game: { Args: { p_game_id: string }; Returns: string | null };
      team_of_player: { Args: { p_player_id: string }; Returns: string | null };
      team_of_lineup: { Args: { p_lineup_id: string }; Returns: string | null };
      team_of_skill_test: { Args: { p_test_id: string }; Returns: string | null };
      generate_join_code: { Args: Record<PropertyKey, never>; Returns: string };
      normalize_join_code: { Args: { p_code: string }; Returns: string };
      score_event_points: {
        Args: { p_sport: Database['public']['Enums']['sport']; p_event_type: string };
        Returns: number | null;
      };
    };
    Enums: {
      sport: 'soccer' | 'baseball' | 'basketball' | 'lacrosse' | 'football';
      theme: 'light' | 'dark' | 'auto';
      field_view: 'persp' | 'flat';
      member_role: 'coach' | 'assistant' | 'parent';
      member_status: 'pending' | 'active' | 'removed';
      guardian_status: 'pending' | 'approved';
      game_status: 'upcoming' | 'live' | 'done';
      home_away: 'home' | 'away' | 'neutral';
      score_side: 'us' | 'them';
      pa_result:
        | 'none'
        | 'single'
        | 'double'
        | 'triple'
        | 'home_run'
        | 'walk'
        | 'hit_by_pitch'
        | 'strikeout'
        | 'out'
        | 'sacrifice'
        | 'fielders_choice'
        | 'reached_on_error';
      skill_metric: 'count' | 'time_seconds' | 'distance' | 'made_of_attempted';
      body_side: 'left' | 'right';
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
export type FunctionReturns<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T]['Returns'];
