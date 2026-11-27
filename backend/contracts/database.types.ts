
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "api": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_card":
{ Args: { "p_business_id": string,"p_card_id": string,"p_evidence": (Database["public"]['Enums']["identity_evidence"])[],"p_note"?: string }; Returns: Json
                           },
"block_card":
{ Args: { "p_business_id": string,"p_card_id": string,"p_reason": string }; Returns: Json
                           },
"create_business":
{ Args: { "p_business": Json }; Returns: Json
                           },
"create_card_batch":
{ Args: { "p_label": string,"p_quantity": number }; Returns: {
              "card_number": string,"qr_payload": string
            }[]
                           },
"create_card_pass":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"create_claim_token":
{ Args: { "p_offer_id": string }; Returns: Json
                           },
"decide_partner":
{ Args: { "p_approve": boolean,"p_business_id": string,"p_note"?: string }; Returns: Json
                           },
"decide_phone_release":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request_id": string }; Returns: Database["public"]['Enums']["phone_release_status"]
                           },
"delete_business":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"get_my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_staff":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_storage_buckets":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_any_permission":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"has_permission":
{ Args: { "p_business_id"?: string,"p_permission": string }; Returns: boolean
                           },
"issue_recovery_code":
{ Args: { "p_business_id"?: string,"p_channel": Database["public"]['Enums']["recovery_channel"],"p_customer_id": string,"p_evidence"?: (Database["public"]['Enums']["identity_evidence"])[],"p_reason"?: string }; Returns: Json
                           },
"link_card":
{ Args: { "p_qr_payload": string }; Returns: Json
                           },
"list_audit_logs":
{ Args: { "p_action"?: string,"p_actor_id"?: string,"p_before_at"?: string,"p_before_id"?: string,"p_business_id"?: string,"p_entity_id"?: string,"p_entity_type"?: string,"p_from"?: string,"p_limit"?: number,"p_to"?: string }; Returns: {
              "action": string,"actor_id": string,"actor_role": string,"after": Json,"before": Json,"business_id": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"ip": unknown,"request_id": string
            }[]
                           },
"list_businesses":
{ Args: Record<PropertyKey, never>; Returns: {
              "brand_color": string,"category": string,"id": string,"kind": string,"logo_path": string,"name": string,"website_url": string
            }[]
                           },
"list_eligible_offers":
{ Args: Record<PropertyKey, never>; Returns: {
              "banner_path": string,"business_id": string,"category_key": string,"description": string,"ends_at": string,"id": string,"max_discount_amount": number,"min_purchase_amount": number,"starts_at": string,"terms": string,"title": string
            }[]
                           },
"list_managed_businesses":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Tables']["businesses"]['Row'][]
                          SetofOptions: {
        from: "*"
        to: "businesses"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_my_redemptions":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "bill_amount": number,"business_id": string,"business_name": string,"id": string,"offer_id": string,"offer_title": string,"redeemed_at": string
            }[]
                           },
"list_my_redemptions_today":
{ Args: { "p_before"?: string,"p_business_id": string,"p_limit"?: number }; Returns: {
              "bill_amount": number,"bill_number": string,"customer_name": string,"id": string,"offer_id": string,"offer_title": string,"phone_masked": string,"redeemed_at": string
            }[]
                           },
"list_offer_categories":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"key": string,"name": string,"sort_order": number
            }[]
                           },
"list_offers":
{ Args: { "p_business_id"?: string }; Returns: Database["public"]['Tables']["offers"]['Row'][]
                          SetofOptions: {
        from: "*"
        to: "offers"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_partner_applications":
{ Args: { "p_status"?: Database["public"]['Enums']["partner_status"] }; Returns: {
              "address": string,"applicant_id": string,"applicant_phone": string,"business_id": string,"business_name": string,"business_phone": string,"category": string,"contact_name": string,"created_at": string,"decided_at": string,"decision_note": string,"is_active": boolean,"logo_path": string,"message": string,"status": Database["public"]['Enums']["partner_status"],"website_url": string
            }[]
                           },
"list_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "business_id": string,"business_name": string,"created_at": string,"display_name": string,"is_active": boolean,"must_change_password": boolean,"phone_e164": string,"role": string,"user_id": string
            }[]
                           },
"preview_claim":
{ Args: { "p_qr_payload": string }; Returns: Json
                           },
"record_identity_check":
{ Args: { "p_business_id": string,"p_customer_id": string,"p_evidence": (Database["public"]['Enums']["identity_evidence"])[],"p_note"?: string,"p_result": Database["public"]['Enums']["identity_check_result"] }; Returns: string
                           },
"redeem_claim":
{ Args: { "p_bill_amount"?: number,"p_bill_number"?: string,"p_idempotency_key": string,"p_qr_payload": string }; Returns: Json
                           },
"reissue_card":
{ Args: { "p_business_id": string,"p_new_qr_payload": string,"p_old_card_id": string,"p_reason": string }; Returns: Json
                           },
"reject_card":
{ Args: { "p_business_id": string,"p_card_id": string,"p_reason": string }; Returns: Json
                           },
"report_birthdays":
{ Args: { "p_month": number }; Returns: {
              "birth_day": number,"customer": Json
            }[]
                           },
"report_export_max_rows":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"report_redemption_rows":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: {
              "bill_amount": number,"bill_number": string,"business": string,"card_number": string,"customer_name": string,"executive": string,"offer": string,"phone_masked": string,"redeemed_at": string,"redemption_id": string
            }[]
                           },
"report_redemptions":
{ Args: { "p_business_id": string,"p_from": string,"p_group_by": string,"p_to": string }; Returns: {
              "bill_total": number,"bucket": string,"label": string,"redemptions": number,"unique_customers": number
            }[]
                           },
"report_signups":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "month": string,"new_customers": number,"now_active_members": number
            }[]
                           },
"report_summary":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: Json
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"request_phone_release":
{ Args: { "p_business_id": string,"p_phone_e164": string,"p_reason": string }; Returns: string
                           },
"revoke_partner":
{ Args: { "p_business_id": string,"p_note"?: string }; Returns: Json
                           },
"scan_card":
{ Args: { "p_business_id": string,"p_qr_payload": string }; Returns: Json
                           },
"set_offer_status":
{ Args: { "p_offer_id": string,"p_status": Database["public"]['Enums']["offer_status"] }; Returns: Json
                           },
"set_setting":
{ Args: { "p_business_id"?: string,"p_key": string,"p_value": Json }; Returns: Json
                           },
"staff_password_changed":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"storage_can_write":
{ Args: { "p_bucket_id": string,"p_name": string }; Returns: boolean
                           },
"svc_claim_due_deletions":
{ Args: { "p_limit": number }; Returns: {
              "request_id": string,"user_id": string
            }[]
                           },
"svc_complete_deletion":
{ Args: { "p_error"?: string,"p_request_id": string }; Returns: undefined
                           },
"svc_consume_recovery_code":
{ Args: { "p_code": string,"p_phone_e164": string }; Returns: Json
                           },
"svc_get_setting":
{ Args: { "p_business_id"?: string,"p_key": string }; Returns: Json
                           },
"svc_login_guard":
{ Args: { "p_phone_e164": string }; Returns: string
                           },
"svc_login_result":
{ Args: { "p_ip": unknown,"p_phone_e164": string,"p_success": boolean }; Returns: string
                           },
"svc_partner_register":
{ Args: { "p_application": Json,"p_user_id": string }; Returns: Json
                           },
"svc_rate_limit":
{ Args: { "p_action": string,"p_key": string }; Returns: undefined
                           },
"svc_revoke_user_sessions":
{ Args: { "p_actor_id": string,"p_reason": string,"p_user_id": string }; Returns: number
                           },
"svc_staff_mark_password_reset":
{ Args: { "p_actor_id": string,"p_user_id": string }; Returns: undefined
                           },
"svc_staff_set_active":
{ Args: { "p_active": boolean,"p_actor_id": string,"p_user_id": string }; Returns: undefined
                           },
"svc_staff_upsert":
{ Args: { "p_actor_id": string,"p_business_id": string,"p_display_name": string,"p_role_key": string,"p_user_id": string }; Returns: undefined
                           },
"update_business":
{ Args: { "p_business_id": string,"p_patch": Json }; Returns: Json
                           },
"upsert_offer":
{ Args: { "p_offer": Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"key": string,"scope_business_id": string | null,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>,"value_schema": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"key": string,"scope_business_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>,"value_schema": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"key"?: string,"scope_business_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>,"value_schema"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_scope_business_fk"
      columns: ["scope_business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "address": string | null,"brand_color": string | null,"category": string | null,"created_at": string,"id": string,"is_active": boolean,"kind": string,"logo_path": string | null,"name": string,"opening_hours": Json | null,"phone": string | null,"slug": string,"timezone": string | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"brand_color"?: string | null,"category"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: string,"logo_path"?: string | null,"name": string,"opening_hours"?: Json | null,"phone"?: string | null,"slug": string,"timezone"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"brand_color"?: string | null,"category"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: string,"logo_path"?: string | null,"name"?: string,"opening_hours"?: Json | null,"phone"?: string | null,"slug"?: string,"timezone"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"card_assignments": {
                  Row: {
                    "card_id": string,"created_at": string,"customer_id": string,"decided_at": string | null,"decided_by": string | null,"decision_business_id": string | null,"id": string,"reason": string | null,"requested_at": string,"status": Database["public"]['Enums']["card_assignment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "card_id": string,"created_at"?: string,"customer_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_business_id"?: string | null,"id"?: string,"reason"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["card_assignment_status"],"updated_at"?: string
                  }
                  Update: {
                    "card_id"?: string,"created_at"?: string,"customer_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_business_id"?: string | null,"id"?: string,"reason"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["card_assignment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_assignments_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_assignments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_assignments_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_assignments_decision_business_id_fkey"
      columns: ["decision_business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"card_batches": {
                  Row: {
                    "created_at": string,"created_by": string,"export_count": number,"exported_at": string | null,"id": string,"label": string,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"export_count"?: number,"exported_at"?: string | null,"id"?: string,"label": string,"quantity": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"export_count"?: number,"exported_at"?: string | null,"id"?: string,"label"?: string,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"card_passes": {
                  Row: {
                    "card_id": string,"created_at": string,"customer_id": string,"expires_at": string,"id": string,"secret_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "card_id": string,"created_at"?: string,"customer_id": string,"expires_at": string,"id"?: string,"secret_hash": string
                  }
                  Update: {
                    "card_id"?: string,"created_at"?: string,"customer_id"?: string,"expires_at"?: string,"id"?: string,"secret_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_passes_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_passes_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cards": {
                  Row: {
                    "batch_id": string,"blocked_reason": string | null,"card_number": string,"created_at": string,"current_customer_id": string | null,"id": string,"status": Database["public"]['Enums']["card_status"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"blocked_reason"?: string | null,"card_number": string,"created_at"?: string,"current_customer_id"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["card_status"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "batch_id"?: string,"blocked_reason"?: string | null,"card_number"?: string,"created_at"?: string,"current_customer_id"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["card_status"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cards_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "card_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cards_current_customer_id_fkey"
      columns: ["current_customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_tokens": {
                  Row: {
                    "business_id": string,"card_id": string,"created_at": string,"customer_id": string,"expires_at": string,"id": string,"offer_id": string,"previewed_at": string | null,"previewed_by": string | null,"secret_hash": string,"status": Database["public"]['Enums']["claim_status"],"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"card_id": string,"created_at"?: string,"customer_id": string,"expires_at": string,"id"?: string,"offer_id": string,"previewed_at"?: string | null,"previewed_by"?: string | null,"secret_hash": string,"status"?: Database["public"]['Enums']["claim_status"],"used_at"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"card_id"?: string,"created_at"?: string,"customer_id"?: string,"expires_at"?: string,"id"?: string,"offer_id"?: string,"previewed_at"?: string | null,"previewed_by"?: string | null,"secret_hash"?: string,"status"?: Database["public"]['Enums']["claim_status"],"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "claim_tokens_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_tokens_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_tokens_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_tokens_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_group_members": {
                  Row: {
                    "created_at": string,"customer_id": string,"group_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"group_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"group_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_group_members_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "customer_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_groups": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deletion_requests": {
                  Row: {
                    "attempts": number,"completed_at": string | null,"error": string | null,"id": string,"process_after": string,"reason": Database["public"]['Enums']["deletion_reason"],"requested_at": string,"requested_by": string | null,"status": Database["public"]['Enums']["deletion_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"completed_at"?: string | null,"error"?: string | null,"id"?: string,"process_after": string,"reason": Database["public"]['Enums']["deletion_reason"],"requested_at"?: string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["deletion_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"completed_at"?: string | null,"error"?: string | null,"id"?: string,"process_after"?: string,"reason"?: Database["public"]['Enums']["deletion_reason"],"requested_at"?: string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["deletion_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deletion_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deletion_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"error_codes": {
                  Row: {
                    "code": string,"created_at": string,"description": string,"http_status": number,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description": string,"http_status": number,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string,"http_status"?: number,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"identity_checks": {
                  Row: {
                    "business_id": string,"checked_at": string,"created_at": string,"customer_id": string,"evidence": (Database["public"]['Enums']["identity_evidence"])[],"executive_id": string,"id": string,"note": string | null,"result": Database["public"]['Enums']["identity_check_result"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"checked_at"?: string,"created_at"?: string,"customer_id": string,"evidence": (Database["public"]['Enums']["identity_evidence"])[],"executive_id": string,"id"?: string,"note"?: string | null,"result": Database["public"]['Enums']["identity_check_result"],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"checked_at"?: string,"created_at"?: string,"customer_id"?: string,"evidence"?: (Database["public"]['Enums']["identity_evidence"])[],"executive_id"?: string,"id"?: string,"note"?: string | null,"result"?: Database["public"]['Enums']["identity_check_result"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "identity_checks_business_fk"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "identity_checks_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "identity_checks_executive_id_fkey"
      columns: ["executive_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offer_categories": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"key": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"key": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"key"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"offer_eligible_groups": {
                  Row: {
                    "group_id": string,"offer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"offer_id": string
                  }
                  Update: {
                    "group_id"?: string,"offer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_eligible_groups_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "customer_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offer_eligible_groups_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offer_schedules": {
                  Row: {
                    "end_time": string,"id": string,"offer_id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "end_time": string,"id"?: string,"offer_id": string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "end_time"?: string,"id"?: string,"offer_id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_schedules_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offer_usage": {
                  Row: {
                    "customer_id": string,"last_used_at": string | null,"offer_id": string,"used_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"last_used_at"?: string | null,"offer_id": string,"used_count"?: number
                  }
                  Update: {
                    "customer_id"?: string,"last_used_at"?: string | null,"offer_id"?: string,"used_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_usage_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offer_usage_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "banner_path": string | null,"birthday_window_days": number | null,"business_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"ends_at": string | null,"id": string,"max_discount_amount": number | null,"max_uses_per_customer": number | null,"min_purchase_amount": number | null,"owner_paused": boolean,"starts_at": string,"status": Database["public"]['Enums']["offer_status"],"terms": string | null,"title": string,"total_redeemed": number,"total_usage_limit": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_path"?: string | null,"birthday_window_days"?: number | null,"business_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"max_discount_amount"?: number | null,"max_uses_per_customer"?: number | null,"min_purchase_amount"?: number | null,"owner_paused"?: boolean,"starts_at"?: string,"status"?: Database["public"]['Enums']["offer_status"],"terms"?: string | null,"title": string,"total_redeemed"?: number,"total_usage_limit"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "banner_path"?: string | null,"birthday_window_days"?: number | null,"business_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"max_discount_amount"?: number | null,"max_uses_per_customer"?: number | null,"min_purchase_amount"?: number | null,"owner_paused"?: boolean,"starts_at"?: string,"status"?: Database["public"]['Enums']["offer_status"],"terms"?: string | null,"title"?: string,"total_redeemed"?: number,"total_usage_limit"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "offer_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_applications": {
                  Row: {
                    "applicant_id": string,"business_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"message": string | null,"status": Database["public"]['Enums']["partner_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_id": string,"business_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"message"?: string | null,"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string
                  }
                  Update: {
                    "applicant_id"?: string,"business_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"message"?: string | null,"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_applications_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_applications_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_applications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"key": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"phone_release_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"holder_customer_id": string,"id": string,"phone_e164": string,"reason": string,"requested_business_id": string,"requested_by": string,"status": Database["public"]['Enums']["phone_release_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"holder_customer_id": string,"id"?: string,"phone_e164": string,"reason": string,"requested_business_id": string,"requested_by": string,"status"?: Database["public"]['Enums']["phone_release_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"holder_customer_id"?: string,"id"?: string,"phone_e164"?: string,"reason"?: string,"requested_business_id"?: string,"requested_by"?: string,"status"?: Database["public"]['Enums']["phone_release_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "phone_release_business_fk"
      columns: ["requested_business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phone_release_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phone_release_requests_holder_customer_id_fkey"
      columns: ["holder_customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phone_release_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "account_status": Database["public"]['Enums']["account_status"],"created_at": string,"date_of_birth": string | null,"full_name": string,"id": string,"identity_checked_at": string | null,"membership_status": Database["public"]['Enums']["membership_status"],"phone_e164": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"created_at"?: string,"date_of_birth"?: string | null,"full_name"?: string,"id": string,"identity_checked_at"?: string | null,"membership_status"?: Database["public"]['Enums']["membership_status"],"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"created_at"?: string,"date_of_birth"?: string | null,"full_name"?: string,"id"?: string,"identity_checked_at"?: string | null,"membership_status"?: Database["public"]['Enums']["membership_status"],"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"redemptions": {
                  Row: {
                    "bill_amount": number | null,"bill_number": string | null,"business_id": string,"card_id": string,"claim_token_id": string,"customer_id": string,"executive_id": string,"id": string,"idempotency_key": string,"offer_id": string,"redeemed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_amount"?: number | null,"bill_number"?: string | null,"business_id": string,"card_id": string,"claim_token_id": string,"customer_id": string,"executive_id": string,"id"?: string,"idempotency_key": string,"offer_id": string,"redeemed_at"?: string
                  }
                  Update: {
                    "bill_amount"?: number | null,"bill_number"?: string | null,"business_id"?: string,"card_id"?: string,"claim_token_id"?: string,"customer_id"?: string,"executive_id"?: string,"id"?: string,"idempotency_key"?: string,"offer_id"?: string,"redeemed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "redemptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_executive_id_fkey"
      columns: ["executive_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "created_at": string,"permission_id": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"permission_id": string,"role_id": string
                  }
                  Update: {
                    "created_at"?: string,"permission_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "business_id": string | null,"created_at": string,"disabled_at": string | null,"disabled_by": string | null,"display_name": string,"is_active": boolean,"must_change_password": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"disabled_by"?: string | null,"display_name": string,"is_active"?: boolean,"must_change_password"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"disabled_by"?: string | null,"display_name"?: string,"is_active"?: boolean,"must_change_password"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_disabled_by_fkey"
      columns: ["disabled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "business_id": string | null,"created_at": string,"granted_at": string,"granted_by": string | null,"id": string,"is_active": boolean,"role_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"is_active"?: boolean,"role_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"is_active"?: boolean,"role_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_business_fk"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "account_status": "active"|"disabled"|"deletion_pending"|"deleted","card_assignment_status": "pending"|"approved"|"rejected"|"revoked","card_status": "unassigned"|"pending"|"active"|"blocked"|"retired","claim_status": "open"|"used"|"expired"|"revoked","deletion_reason": "customer_request"|"unchecked_account","deletion_status": "requested"|"processing"|"completed"|"failed","identity_check_result": "passed"|"failed","identity_evidence": "registration_details"|"proof_of_purchase"|"account_info","membership_status": "none"|"pending"|"active"|"rejected"|"blocked","offer_status": "draft"|"active"|"paused"|"archived","partner_status": "pending"|"approved"|"rejected"|"revoked","phone_release_status": "pending"|"approved"|"rejected"|"cancelled","recovery_channel": "in_store"|"owner_remote"
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
  "api": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["active", "disabled", "deletion_pending", "deleted"],"card_assignment_status": ["pending", "approved", "rejected", "revoked"],"card_status": ["unassigned", "pending", "active", "blocked", "retired"],"claim_status": ["open", "used", "expired", "revoked"],"deletion_reason": ["customer_request", "unchecked_account"],"deletion_status": ["requested", "processing", "completed", "failed"],"identity_check_result": ["passed", "failed"],"identity_evidence": ["registration_details", "proof_of_purchase", "account_info"],"membership_status": ["none", "pending", "active", "rejected", "blocked"],"offer_status": ["draft", "active", "paused", "archived"],"partner_status": ["pending", "approved", "rejected", "revoked"],"phone_release_status": ["pending", "approved", "rejected", "cancelled"],"recovery_channel": ["in_store", "owner_remote"]
          }
        }
} as const
