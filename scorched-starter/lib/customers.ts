// lib/customers.ts — server-only data layer for customer accounts
import { getSupabase } from "@/lib/supabase";

export type Customer = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomer(email: string, passwordHash: string): Promise<Customer> {
  const { data, error } = await getSupabase()
    .from("customers")
    .insert({ email, password_hash: passwordHash })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomerPassword(email: string, passwordHash: string): Promise<void> {
  const { error } = await getSupabase()
    .from("customers")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("email", email);
  if (error) throw error;
}
