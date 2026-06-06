export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          initial_balance: number;
          name: string;
          type: Database["public"]["Enums"]["account_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          initial_balance?: number;
          name: string;
          type: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          initial_balance?: number;
          name?: string;
          type?: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          color: string;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          type: Database["public"]["Enums"]["tx_type"];
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["tx_type"];
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["tx_type"];
          user_id?: string;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          created_at: string;
          from_currency: string;
          id: string;
          rate: number;
          to_currency: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          from_currency: string;
          id?: string;
          rate: number;
          to_currency: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          from_currency?: string;
          id?: string;
          rate?: number;
          to_currency?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      financial_settings: {
        Row: {
          created_at: string;
          reporting_currency: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          reporting_currency?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          reporting_currency?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          account_id: string;
          amount: number;
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          occurred_on: string;
          transfer_id: string | null;
          type: Database["public"]["Enums"]["tx_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          amount: number;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          occurred_on?: string;
          transfer_id?: string | null;
          type: Database["public"]["Enums"]["tx_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          occurred_on?: string;
          transfer_id?: string | null;
          type?: Database["public"]["Enums"]["tx_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_user_fkey";
            columns: ["account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_transfer_user_fkey";
            columns: ["transfer_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "transfers";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      transfers: {
        Row: {
          created_at: string;
          description: string | null;
          from_account_id: string;
          from_amount: number;
          id: string;
          occurred_on: string;
          to_account_id: string;
          to_amount: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          from_account_id: string;
          from_amount: number;
          id?: string;
          occurred_on?: string;
          to_account_id: string;
          to_amount: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          from_account_id?: string;
          from_amount?: number;
          id?: string;
          occurred_on?: string;
          to_account_id?: string;
          to_amount?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_user_id_fkey";
            columns: ["from_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "transfers_to_account_id_user_id_fkey";
            columns: ["to_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      account_balances: {
        Row: {
          balance: number | null;
          created_at: string | null;
          currency: string | null;
          id: string | null;
          initial_balance: number | null;
          name: string | null;
          type: Database["public"]["Enums"]["account_type"] | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_transfer: {
        Args: {
          p_description?: string;
          p_from_account_id: string;
          p_from_amount: number;
          p_occurred_on?: string;
          p_to_account_id: string;
          p_to_amount?: number;
        };
        Returns: string;
      };
      delete_account_reassign: {
        Args: {
          p_account_id: string;
          p_destination_account_id: string;
        };
        Returns: undefined;
      };
      delete_transfer: {
        Args: { p_transfer_id: string };
        Returns: undefined;
      };
      update_transfer: {
        Args: {
          p_description?: string;
          p_from_account_id: string;
          p_from_amount: number;
          p_occurred_on?: string;
          p_to_account_id: string;
          p_to_amount?: number;
          p_transfer_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: "checking" | "savings" | "wallet" | "investment";
      tx_type: "income" | "expense";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_type: ["checking", "savings", "wallet", "investment"],
      tx_type: ["income", "expense"],
    },
  },
} as const;
