// lib/marketing/MarketingEmail.tsx
//
// The one branded template every marketing email renders through. Campaign
// bodies are markdown, converted to HTML by the caller and passed in here as
// `bodyHtml`.
//
// The footer is not decoration. CAN-SPAM requires a physical postal address
// and a working unsubscribe link in every marketing message, so both live in
// the template rather than in campaign copy where an author could forget them.
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BUSINESS_NAME, BUSINESS_POSTAL_ADDRESS } from "./consent-copy";

// Matches the palette the transactional mail already uses.
const BRAND = "#884A20";
const INK = "#3A3A3A";
const MUTED = "#888888";

export type MarketingEmailProps = {
  heading?: string | null;
  bodyHtml: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  unsubscribeUrl: string;
  previewText?: string | null;
};

export default function MarketingEmail({
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  unsubscribeUrl,
  previewText,
}: MarketingEmailProps) {
  return (
    <Html>
      <Head />
      {previewText ? <Preview>{previewText}</Preview> : null}
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "system-ui, sans-serif", color: INK, margin: 0 }}>
        <Container style={{ maxWidth: "520px", margin: "0 auto", padding: "24px 16px" }}>
          <Text
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: BRAND,
              margin: "0 0 16px",
            }}
          >
            {BUSINESS_NAME}
          </Text>

          {heading ? (
            <Text style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 12px", lineHeight: 1.3 }}>
              {heading}
            </Text>
          ) : null}

          {/* The campaign body arrives as HTML already rendered from markdown
              by the caller, which is the same remark pipeline the blog uses. */}
          <Section
            style={{ fontSize: "15px", lineHeight: 1.6, color: "#555555" }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {ctaUrl && ctaLabel ? (
            <Section style={{ margin: "28px 0" }}>
              <Link
                href={ctaUrl}
                style={{
                  backgroundColor: BRAND,
                  color: "#ffffff",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                {ctaLabel}
              </Link>
            </Section>
          ) : null}

          <Hr style={{ border: "none", borderTop: "1px solid #eeeeee", margin: "28px 0" }} />

          <Text style={{ fontSize: "12px", color: MUTED, margin: "0 0 6px", lineHeight: 1.5 }}>
            You are getting this because you asked us to email you about classes, events, and offers.
          </Text>
          <Text style={{ fontSize: "12px", color: MUTED, margin: "0 0 6px" }}>
            <Link href={unsubscribeUrl} style={{ color: MUTED, textDecoration: "underline" }}>
              Unsubscribe
            </Link>
          </Text>
          <Text style={{ fontSize: "12px", color: MUTED, margin: 0 }}>
            {BUSINESS_NAME}, {BUSINESS_POSTAL_ADDRESS}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
