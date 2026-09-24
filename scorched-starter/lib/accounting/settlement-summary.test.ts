import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeSquareOrders } from "./settlement-summary.ts";

test("summarizeSquareOrders counts completed orders, skips gift cards, and spots admissions", () => {
  const s = summarizeSquareOrders([
    { state: "COMPLETED", line_items: [
      { name: "General Admission", quantity: "3", gross_sales_money: { amount: 9000 } },
      { name: "Gift Card", item_type: "GIFT_CARD", quantity: "1", gross_sales_money: { amount: 5000 } },
      { note: "private session", quantity: "1", gross_sales_money: { amount: 12000 } },
    ] },
    { state: "COMPLETED", line_items: [{ name: "Candle", quantity: "2", gross_sales_money: { amount: 4000 } }] },
    { state: "CANCELED", line_items: [{ name: "Candle", quantity: "1", gross_sales_money: { amount: 2000 } }] },
  ]);
  assert.equal(s.orders, 2);
  assert.equal(s.items, 6);
  assert.equal(s.grossCents, 25000);
  assert.deepEqual(s.itemRevenueCents, { "General Admission": 9000, "private session": 12000, Candle: 4000 });
  assert.equal(s.admissionOrders, 1);
  assert.equal(s.admissionSeats, 3);
});
