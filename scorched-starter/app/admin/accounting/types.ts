// app/admin/accounting/types.ts — shared shapes for the accounting admin UI
export type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
  is_cash: boolean;
  is_contra: boolean;
  active: boolean;
};
