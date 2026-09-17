// lib/marketing/sms-provider-registry.ts — server only
//
// Picks the SMS provider from SMS_PROVIDER. Telnyx is the default and the only
// one used in anger; Sendblue is kept whole and reachable so it can be revived
// for two-way iMessage conversations, which is the one thing it is better at.
import type { SmsProvider } from "./sms-provider.ts";
import { smsProviderName } from "./config.ts";
import { telnyx } from "./telnyx.ts";
import { sendblue } from "./sendblue.ts";

export function smsProvider(): SmsProvider {
  return smsProviderName() === "sendblue" ? sendblue : telnyx;
}
