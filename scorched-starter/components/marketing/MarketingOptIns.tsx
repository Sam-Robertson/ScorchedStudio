'use client';

// The two marketing opt-in checkboxes, shared by the waiver, the booking
// checkout, and the footer signup so all three show byte-identical wording.
// The strings come from lib/marketing/consent-copy, which is also what the
// server writes into the consent log, so the record always matches what was
// on screen.
//
// Both boxes start unchecked. Nothing here may be pre-ticked: pre-checked
// consent is not consent under TCPA, and it is the first thing a carrier
// audit looks for.
import Link from 'next/link';
import {
  EMAIL_CONSENT_TEXT,
  SMS_CONSENT_TEXT,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
} from '@/lib/marketing/consent-copy';

export type OptInState = {
  email: boolean;
  sms: boolean;
};

export const EMPTY_OPT_INS: OptInState = { email: false, sms: false };

export default function MarketingOptIns({
  value,
  onChange,
  tone = 'light',
  // The footer form collects a phone number only to support the SMS box, so it
  // hides the SMS option until there is somewhere to text.
  showSms = true,
  idPrefix = 'optin',
}: {
  value: OptInState;
  onChange: (next: OptInState) => void;
  tone?: 'light' | 'dark';
  showSms?: boolean;
  idPrefix?: string;
}) {
  const labelCls =
    tone === 'dark' ? 'text-xs leading-relaxed text-white/70' : 'text-xs leading-relaxed text-neutral-600';
  const linkCls = tone === 'dark' ? 'underline hover:text-white' : 'underline hover:text-neutral-900';
  const boxCls =
    tone === 'dark'
      ? 'mt-0.5 h-4 w-4 shrink-0 accent-white'
      : 'mt-0.5 h-4 w-4 shrink-0 accent-[#884A20]';

  return (
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-email`} className="flex items-start gap-2 cursor-pointer">
        <input
          id={`${idPrefix}-email`}
          type="checkbox"
          checked={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.checked })}
          className={boxCls}
        />
        <span className={labelCls}>{EMAIL_CONSENT_TEXT}</span>
      </label>

      {showSms && (
        <label htmlFor={`${idPrefix}-sms`} className="flex items-start gap-2 cursor-pointer">
          <input
            id={`${idPrefix}-sms`}
            type="checkbox"
            checked={value.sms}
            onChange={(e) => onChange({ ...value, sms: e.target.checked })}
            className={boxCls}
          />
          <span className={labelCls}>
            {SMS_CONSENT_TEXT}{' '}
            <Link href={PRIVACY_POLICY_PATH} className={linkCls}>
              Privacy Policy
            </Link>
            {' and '}
            <Link href={TERMS_PATH} className={linkCls}>
              Terms
            </Link>
            .
          </span>
        </label>
      )}
    </div>
  );
}
