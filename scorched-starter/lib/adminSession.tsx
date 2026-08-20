"use client";
// Client-side session context — populated by app/admin/layout.tsx after it
// validates the stored token against GET /api/admin/session. Pages that need
// to know their role/location (the 4 In Studio pages, /admin/locations) read
// it via useAdminSession(); pages that only need the bearer token can keep
// using lib/adminAuth.ts's getAdminToken() as before.
import { createContext, useContext } from "react";

export type Role = "admin" | "location";
export type LocationKey = "orem" | "slc";

export type AdminSessionValue = {
  token: string;
  role: Role;
  location: LocationKey | null;
};

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export const AdminSessionProvider = AdminSessionContext.Provider;

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within the admin layout");
  return ctx;
}
