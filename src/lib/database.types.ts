
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "game_coach_notes": {
                  Row: {
                    "game_id": string,"notes": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"notes"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "game_id"?: string,"notes"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_coach_notes_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "game_coach_notes_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_players": {
                  Row: {
                    "available": boolean,"game_id": string,"name_snapshot": string,"number_snapshot": string | null,"player_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available"?: boolean,"game_id": string,"name_snapshot": string,"number_snapshot"?: string | null,"player_id": string
                  }
                  Update: {
                    "available"?: boolean,"game_id"?: string,"name_snapshot"?: string,"number_snapshot"?: string | null,"player_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "game_players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_players_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "address": string | null,"created_at": string,"finished_at": string | null,"game_date": string,"home_away": Database["public"]['Enums']["home_away"] | null,"id": string,"location": string | null,"opponent": string,"parent_notes": string | null,"season_id": string,"start_time": string | null,"started_at": string | null,"status": Database["public"]['Enums']["game_status"],"team_id": string,"team_name_snapshot": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"finished_at"?: string | null,"game_date"?: string,"home_away"?: Database["public"]['Enums']["home_away"] | null,"id"?: string,"location"?: string | null,"opponent"?: string,"parent_notes"?: string | null,"season_id": string,"start_time"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"],"team_id": string,"team_name_snapshot"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"finished_at"?: string | null,"game_date"?: string,"home_away"?: Database["public"]['Enums']["home_away"] | null,"id"?: string,"location"?: string | null,"opponent"?: string,"parent_notes"?: string | null,"season_id"?: string,"start_time"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"],"team_id"?: string,"team_name_snapshot"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"join_attempts": {
                  Row: {
                    "attempted_at": string,"code_tried": string,"id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"code_tried": string,"id"?: never,"user_id": string
                  }
                  Update: {
                    "attempted_at"?: string,"code_tried"?: string,"id"?: never,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lineup_slots": {
                  Row: {
                    "auto_picked": boolean,"lineup_id": string,"player_id": string | null,"position_code": string,"position_role": string,"slot_index": number
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_picked"?: boolean,"lineup_id": string,"player_id"?: string | null,"position_code": string,"position_role": string,"slot_index": number
                  }
                  Update: {
                    "auto_picked"?: boolean,"lineup_id"?: string,"player_id"?: string | null,"position_code"?: string,"position_role"?: string,"slot_index"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lineup_slots_lineup_id_fkey"
      columns: ["lineup_id"]
isOneToOne: false
      referencedRelation: "lineups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lineup_slots_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"lineups": {
                  Row: {
                    "created_at": string,"formation_name": string,"game_id": string | null,"id": string,"period_index": number,"team_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"formation_name": string,"game_id"?: string | null,"id"?: string,"period_index": number,"team_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"formation_name"?: string,"game_id"?: string | null,"id"?: string,"period_index"?: number,"team_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lineups_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "lineups_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lineups_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"plate_appearances": {
                  Row: {
                    "created_at": string,"created_by": string | null,"game_id": string,"id": string,"inning": number,"occurred_at": string,"player_id": string,"rbi": number,"result": Database["public"]['Enums']["pa_result"],"sequence": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"game_id": string,"id"?: string,"inning": number,"occurred_at"?: string,"player_id": string,"rbi"?: number,"result"?: Database["public"]['Enums']["pa_result"],"sequence"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"game_id"?: string,"id"?: string,"inning"?: number,"occurred_at"?: string,"player_id"?: string,"rbi"?: number,"result"?: Database["public"]['Enums']["pa_result"],"sequence"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plate_appearances_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "plate_appearances_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plate_appearances_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"player_contacts": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"name": string,"phone": string | null,"player_id": string,"relationship": string | null,"share_with_team": boolean,"sort_order": number,"updated_at": string,"updated_by": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"phone"?: string | null,"player_id": string,"relationship"?: string | null,"share_with_team"?: boolean,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"phone"?: string | null,"player_id"?: string,"relationship"?: string | null,"share_with_team"?: boolean,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_contacts_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"player_details": {
                  Row: {
                    "birthdate": string | null,"player_id": string,"shirt_size": Database["public"]['Enums']["shirt_size"] | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "birthdate"?: string | null,"player_id": string,"shirt_size"?: Database["public"]['Enums']["shirt_size"] | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "birthdate"?: string | null,"player_id"?: string,"shirt_size"?: Database["public"]['Enums']["shirt_size"] | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_details_player_id_fkey"
      columns: ["player_id"]
isOneToOne: true
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"player_guardians": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"id": string,"player_id": string,"relationship": string | null,"status": Database["public"]['Enums']["guardian_status"],"unlisted_child_name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"player_id": string,"relationship"?: string | null,"status"?: Database["public"]['Enums']["guardian_status"],"unlisted_child_name"?: string | null,"user_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"player_id"?: string,"relationship"?: string | null,"status"?: Database["public"]['Enums']["guardian_status"],"unlisted_child_name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_guardians_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "archived_at": string | null,"batting_order": number | null,"created_at": string,"first_name": string,"id": string,"is_available": boolean,"jersey_number": string | null,"last_name": string | null,"sort_order": number,"team_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"batting_order"?: number | null,"created_at"?: string,"first_name": string,"id"?: string,"is_available"?: boolean,"jersey_number"?: string | null,"last_name"?: string | null,"sort_order"?: number,"team_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"batting_order"?: number | null,"created_at"?: string,"first_name"?: string,"id"?: string,"is_available"?: boolean,"jersey_number"?: string | null,"last_name"?: string | null,"sort_order"?: number,"team_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"practices": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string | null,"end_time": string | null,"id": string,"location": string | null,"notes": string | null,"practice_date": string,"season_id": string,"start_time": string | null,"status": Database["public"]['Enums']["practice_status"],"team_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"practice_date": string,"season_id": string,"start_time"?: string | null,"status"?: Database["public"]['Enums']["practice_status"],"team_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"practice_date"?: string,"season_id"?: string,"start_time"?: string | null,"status"?: Database["public"]['Enums']["practice_status"],"team_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "practices_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practices_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"field_view": Database["public"]['Enums']["field_view"],"id": string,"is_platform_admin": boolean,"last_team_id": string | null,"theme": Database["public"]['Enums']["theme"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"field_view"?: Database["public"]['Enums']["field_view"],"id": string,"is_platform_admin"?: boolean,"last_team_id"?: string | null,"theme"?: Database["public"]['Enums']["theme"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"field_view"?: Database["public"]['Enums']["field_view"],"id"?: string,"is_platform_admin"?: boolean,"last_team_id"?: string | null,"theme"?: Database["public"]['Enums']["theme"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_last_team_fk"
      columns: ["last_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"score_events": {
                  Row: {
                    "assist_player_id": string | null,"created_at": string,"created_by": string | null,"event_type": string,"game_id": string,"id": string,"occurred_at": string,"period_index": number,"points": number,"scorer_player_id": string | null,"side": Database["public"]['Enums']["score_side"],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assist_player_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_type": string,"game_id": string,"id"?: string,"occurred_at"?: string,"period_index": number,"points": number,"scorer_player_id"?: string | null,"side": Database["public"]['Enums']["score_side"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "assist_player_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_type"?: string,"game_id"?: string,"id"?: string,"occurred_at"?: string,"period_index"?: number,"points"?: number,"scorer_player_id"?: string | null,"side"?: Database["public"]['Enums']["score_side"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "score_events_assist_player_id_fkey"
      columns: ["assist_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "score_events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "score_events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "score_events_scorer_player_id_fkey"
      columns: ["scorer_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"is_current": boolean,"name": string,"starts_on": string | null,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"is_current"?: boolean,"name": string,"starts_on"?: string | null,"team_id": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"is_current"?: boolean,"name"?: string,"starts_on"?: string | null,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seasons_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"skill_results": {
                  Row: {
                    "attempts": number | null,"created_at": string,"id": string,"note": string | null,"player_id": string,"recorded_by": string | null,"side": Database["public"]['Enums']["body_side"] | null,"skill_test_id": string,"tested_on": string,"updated_at": string,"updated_by": string | null,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number | null,"created_at"?: string,"id"?: string,"note"?: string | null,"player_id": string,"recorded_by"?: string | null,"side"?: Database["public"]['Enums']["body_side"] | null,"skill_test_id": string,"tested_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"value": number
                  }
                  Update: {
                    "attempts"?: number | null,"created_at"?: string,"id"?: string,"note"?: string | null,"player_id"?: string,"recorded_by"?: string | null,"side"?: Database["public"]['Enums']["body_side"] | null,"skill_test_id"?: string,"tested_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_results_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skill_results_skill_test_id_fkey"
      columns: ["skill_test_id"]
isOneToOne: false
      referencedRelation: "skill_tests"
      referencedColumns: ["id"]
    }
                  ]
                },"skill_tests": {
                  Row: {
                    "attempts": number,"created_at": string,"has_sides": boolean,"higher_is_better": boolean,"id": string,"instructions": string,"is_active": boolean,"key": string,"metric": Database["public"]['Enums']["skill_metric"],"name": string,"sort_order": number,"team_id": string,"unit": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"has_sides"?: boolean,"higher_is_better"?: boolean,"id"?: string,"instructions"?: string,"is_active"?: boolean,"key": string,"metric": Database["public"]['Enums']["skill_metric"],"name": string,"sort_order"?: number,"team_id": string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"has_sides"?: boolean,"higher_is_better"?: boolean,"id"?: string,"instructions"?: string,"is_active"?: boolean,"key"?: string,"metric"?: Database["public"]['Enums']["skill_metric"],"name"?: string,"sort_order"?: number,"team_id"?: string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_tests_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"contact_phone": string | null,"created_at": string,"id": string,"note": string | null,"requested_role": Database["public"]['Enums']["member_role"] | null,"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"team_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"requested_role"?: Database["public"]['Enums']["member_role"] | null,"role": Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"team_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"requested_role"?: Database["public"]['Enums']["member_role"] | null,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "archived_at": string | null,"colors": NonNullable<Json>,"created_at": string,"has_gk": boolean,"id": string,"join_code": string,"join_code_rotated_at": string,"join_enabled": boolean,"last_batter_player_id": string | null,"name": string,"owner_id": string,"parent_stats": Database["public"]['Enums']["parent_stats"],"periods_count": number,"side_size": number,"sport": Database["public"]['Enums']["sport"],"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"colors"?: NonNullable<Json>,"created_at"?: string,"has_gk"?: boolean,"id"?: string,"join_code": string,"join_code_rotated_at"?: string,"join_enabled"?: boolean,"last_batter_player_id"?: string | null,"name": string,"owner_id": string,"parent_stats"?: Database["public"]['Enums']["parent_stats"],"periods_count": number,"side_size": number,"sport": Database["public"]['Enums']["sport"],"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"colors"?: NonNullable<Json>,"created_at"?: string,"has_gk"?: boolean,"id"?: string,"join_code"?: string,"join_code_rotated_at"?: string,"join_enabled"?: boolean,"last_batter_player_id"?: string | null,"name"?: string,"owner_id"?: string,"parent_stats"?: Database["public"]['Enums']["parent_stats"],"periods_count"?: number,"side_size"?: number,"sport"?: Database["public"]['Enums']["sport"],"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_last_batter_fk"
      columns: ["last_batter_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"unlisted_child_requests": {
                  Row: {
                    "child_name": string,"created_at": string,"id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_name": string,"created_at"?: string,"id"?: string,"member_id": string
                  }
                  Update: {
                    "child_name"?: string,"created_at"?: string,"id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unlisted_child_requests_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "game_line_score": {
                  Row: {
                    "game_id": string,"period_index": number,"points": number | null,"side": Database["public"]['Enums']["score_side"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "score_events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "score_events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_scores": {
                  Row: {
                    "game_id": string,"them": number | null,"us": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "admin_add_member":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["member_role"],"p_team_id": string }; Returns: string
                           },
"admin_change_sport":
{ Args: { "p_colors": Json,"p_has_gk": boolean,"p_periods_count": number,"p_side_size": number,"p_sport": Database["public"]['Enums']["sport"],"p_team_id": string,"p_template": Json }; Returns: undefined
                           },
"admin_list_teams":
{ Args: Record<PropertyKey, never>; Returns: {
              "archived_at": string,"assistants": number,"coaches": number,"created_at": string,"id": string,"name": string,"owner_email": string,"owner_id": string,"owner_name": string,"parents": number,"pending": number,"players": number,"sport": Database["public"]['Enums']["sport"]
            }[]
                           },
"admin_list_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"display_name": string,"email": string,"is_platform_admin": boolean,"teams": Json,"user_id": string
            }[]
                           },
"approve_guardian_link":
{ Args: { "p_approve"?: boolean,"p_link_id": string }; Returns: undefined
                           },
"approve_member":
{ Args: { "p_member_id": string,"p_player_ids"?: (string)[],"p_role": Database["public"]['Enums']["member_role"] }; Returns: undefined
                           },
"archive_player":
{ Args: { "p_player_id": string }; Returns: undefined
                           },
"can_see_contact":
{ Args: { "p_player_id": string,"p_shared": boolean }; Returns: boolean
                           },
"can_see_player_private":
{ Args: { "p_player_id": string }; Returns: boolean
                           },
"can_see_player_stats":
{ Args: { "p_player_id": string }; Returns: boolean
                           },
"clear_player_from_plans":
{ Args: { "p_player_id": string }; Returns: undefined
                           },
"copy_lineups":
{ Args: { "p_from_game": string,"p_team_id": string,"p_to_game": string }; Returns: undefined
                           },
"create_team":
{ Args: { "p_colors": Json,"p_has_gk": boolean,"p_name": string,"p_periods_count": number,"p_side_size": number,"p_skill_tests"?: Json,"p_sport": Database["public"]['Enums']["sport"],"p_template": Json }; Returns: string
                           },
"decline_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"default_skill_tests":
{ Args: { "p_sport": Database["public"]['Enums']["sport"] }; Returns: Json
                           },
"email_confirmed":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"finish_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"game_events":
{ Args: { "p_game_id": string }; Returns: {
              "assist_player_id": string,"created_at": string,"created_by": string,"event_type": string,"game_id": string,"hidden": boolean,"id": string,"occurred_at": string,"period_index": number,"points": number,"scorer_player_id": string,"side": Database["public"]['Enums']["score_side"],"updated_at": string,"updated_by": string
            }[]
                           },
"game_plate_appearances":
{ Args: { "p_game_id": string }; Returns: {
              "created_at": string,"created_by": string,"game_id": string,"hidden": boolean,"id": string,"inning": number,"occurred_at": string,"player_id": string,"rbi": number,"result": Database["public"]['Enums']["pa_result"],"sequence": number,"updated_at": string,"updated_by": string
            }[]
                           },
"game_scores_for":
{ Args: { "p_game_ids": (string)[] }; Returns: {
              "game_id": string,"them": number,"us": number
            }[]
                           },
"generate_join_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"import_legacy_backup":
{ Args: { "p_data": Json,"p_team_id": string }; Returns: Json
                           },
"is_active_member":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"is_coach":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"is_guardian_of":
{ Args: { "p_player_id": string }; Returns: boolean
                           },
"is_owner":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"list_team_members":
{ Args: { "p_team_id": string }; Returns: {
              "approved_at": string,"children": Json,"created_at": string,"display_name": string,"email": string,"is_owner": boolean,"member_id": string,"requested_role": Database["public"]['Enums']["member_role"],"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"unlisted": Json,"user_id": string
            }[]
                           },
"lookup_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"lookup_join_code":
{ Args: { "p_code": string }; Returns: Json
                           },
"member_role_on":
{ Args: { "p_team_id": string }; Returns: Database["public"]['Enums']["member_role"]
                           },
"my_pending_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"member_id": string,"requested_role": Database["public"]['Enums']["member_role"],"sport": Database["public"]['Enums']["sport"],"team_id": string,"team_name": string
            }[]
                           },
"normalize_join_code":
{ Args: { "p_code": string }; Returns: string
                           },
"player_people":
{ Args: { "p_player_id": string }; Returns: {
              "can_edit": boolean,"contact_id": string,"email": string,"in_app": boolean,"link_status": string,"name": string,"phone": string,"relationship": string,"share_with_team": boolean,"user_id": string
            }[]
                           },
"player_season_stats":
{ Args: { "p_game_id"?: string,"p_season_id"?: string,"p_team_id": string }; Returns: {
              "assists": number,"at_bats": number,"doubles": number,"field_goals": number,"free_throws": number,"games_played": number,"goals": number,"hits": number,"home_runs": number,"name": string,"number": string,"periods_played": number,"plate_appearances": number,"player_id": string,"points": number,"rbi": number,"removed": boolean,"runs": number,"strikeouts": number,"three_pointers": number,"triples": number,"walks": number
            }[]
                           },
"record_join_attempt":
{ Args: { "p_code": string,"p_uid": string }; Returns: undefined
                           },
"remove_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"request_guardian_link":
{ Args: { "p_player_id": string,"p_relationship"?: string }; Returns: string
                           },
"request_join":
{ Args: { "p_code": string,"p_phone"?: string,"p_player_ids"?: (string)[],"p_requested_role": Database["public"]['Enums']["member_role"],"p_unlisted_child_name"?: string }; Returns: Json
                           },
"restore_skill_tests":
{ Args: { "p_team_id": string,"p_tests"?: Json }; Returns: number
                           },
"roster_directory":
{ Args: { "p_team_id": string }; Returns: {
              "parent_names": (string)[],"player_id": string
            }[]
                           },
"rotate_join_code":
{ Args: { "p_team_id": string }; Returns: string
                           },
"save_lineups":
{ Args: { "p_game_id"?: string,"p_periods"?: Json,"p_team_id": string }; Returns: undefined
                           },
"score_event_points":
{ Args: { "p_event_type": string,"p_sport": Database["public"]['Enums']["sport"] }; Returns: number
                           },
"sees_all_stats":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"set_batting_order":
{ Args: { "p_player_ids": (string)[],"p_team_id": string }; Returns: undefined
                           },
"set_join_enabled":
{ Args: { "p_enabled": boolean,"p_team_id": string }; Returns: undefined
                           },
"set_member_role":
{ Args: { "p_member_id": string,"p_role": Database["public"]['Enums']["member_role"] }; Returns: undefined
                           },
"set_player_available":
{ Args: { "p_available": boolean,"p_player_id": string }; Returns: undefined
                           },
"set_skill_test_order":
{ Args: { "p_ids": (string)[],"p_team_id": string }; Returns: undefined
                           },
"snapshot_game_players":
{ Args: { "p_game_id": string,"p_team_id": string }; Returns: undefined
                           },
"start_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"team_of_game":
{ Args: { "p_game_id": string }; Returns: string
                           },
"team_of_lineup":
{ Args: { "p_lineup_id": string }; Returns: string
                           },
"team_of_player":
{ Args: { "p_player_id": string }; Returns: string
                           },
"team_of_skill_test":
{ Args: { "p_test_id": string }; Returns: string
                           },
"team_places":
{ Args: { "p_team_id": string }; Returns: {
              "address": string,"last_used": string,"location": string,"uses": number
            }[]
                           },
"team_sheet":
{ Args: { "p_team_id": string }; Returns: {
              "birthdate": string,"contacts": Json,"first_name": string,"jersey_number": string,"last_name": string,"player_id": string,"shirt_size": Database["public"]['Enums']["shirt_size"]
            }[]
                           },
"transfer_ownership":
{ Args: { "p_team_id": string,"p_user_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "body_side": "left"|"right","field_view": "persp"|"flat","game_status": "upcoming"|"live"|"done","guardian_status": "pending"|"approved","home_away": "home"|"away"|"neutral","member_role": "coach"|"assistant"|"parent","member_status": "pending"|"active"|"removed","pa_result": "none"|"single"|"double"|"triple"|"home_run"|"walk"|"hit_by_pitch"|"strikeout"|"out"|"sacrifice"|"fielders_choice"|"reached_on_error","parent_stats": "own"|"team","practice_status": "scheduled"|"cancelled","score_side": "us"|"them","shirt_size": "YXS"|"YS"|"YM"|"YL"|"YXL"|"AS"|"AM"|"AL"|"AXL","skill_metric": "count"|"time_seconds"|"distance"|"made_of_attempted","sport": "soccer"|"baseball"|"basketball"|"lacrosse"|"football","theme": "light"|"dark"|"auto"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "body_side": ["left", "right"],"field_view": ["persp", "flat"],"game_status": ["upcoming", "live", "done"],"guardian_status": ["pending", "approved"],"home_away": ["home", "away", "neutral"],"member_role": ["coach", "assistant", "parent"],"member_status": ["pending", "active", "removed"],"pa_result": ["none", "single", "double", "triple", "home_run", "walk", "hit_by_pitch", "strikeout", "out", "sacrifice", "fielders_choice", "reached_on_error"],"parent_stats": ["own", "team"],"practice_status": ["scheduled", "cancelled"],"score_side": ["us", "them"],"shirt_size": ["YXS", "YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL"],"skill_metric": ["count", "time_seconds", "distance", "made_of_attempted"],"sport": ["soccer", "baseball", "basketball", "lacrosse", "football"],"theme": ["light", "dark", "auto"]
          }
        }
} as const
