// lib/marketing/BlockEmail.tsx
//
// Renders a block document to an email.
//
// Two rules shape everything here.
//
// First, the footer is part of the shell and not a block. CAN-SPAM requires a
// postal address and a working unsubscribe link in every marketing message, so
// the one way to guarantee they are present is to make them unreachable from
// the editor. An empty block array still produces a compliant email.
//
// Second, this renders once per campaign, not once per recipient. Anything
// that differs per person is emitted as a placeholder and substituted as a
// string afterwards by email-render.ts. Rendering React 540 times to change a
// name and a token would make send time scale with the size of the list.
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import { BUSINESS_NAME, BUSINESS_POSTAL_ADDRESS } from "./consent-copy";
import {
  FONT_STACKS,
  type EmailBlock,
  type EmailDesign,
} from "./email-blocks";

// Swapped for each recipient's own unsubscribe URL after rendering. Deliberately
// not a valid URL: if substitution were ever skipped, a broken link is obvious,
// while a plausible-looking one would quietly unsubscribe the wrong person.
export const UNSUBSCRIBE_PLACEHOLDER = "__SCORCHED_UNSUBSCRIBE_URL__";

export type BlockEmailProps = {
  blocks: EmailBlock[];
  design: EmailDesign;
  previewText?: string | null;
  // Absolute, because an email client has no page to resolve a relative path
  // against.
  logoUrl?: string | null;
};

const SPACER_HEIGHT = { sm: 12, md: 28, lg: 48 };
const IMAGE_WIDTH = { full: "100%", half: "50%", third: "33%" };

export default function BlockEmail({ blocks, design, previewText, logoUrl }: BlockEmailProps) {
  const font = FONT_STACKS[design.fontFamily];

  return (
    <Html lang="en">
      <Head>
        {/* The only media query in the message. Outlook ignores it and keeps
            the desktop table, which is the correct fallback. */}
        <style>{`
          @media only screen and (max-width: 600px) {
            .sc-stack { display: block !important; width: 100% !important; padding: 0 0 16px 0 !important; }
            .sc-pad { padding-left: 20px !important; padding-right: 20px !important; }
          }
        `}</style>
      </Head>
      {previewText ? <Preview>{previewText}</Preview> : null}
      <Body
        style={{
          backgroundColor: design.backgroundColor,
          fontFamily: font,
          color: design.textColor,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            maxWidth: `${design.contentWidth}px`,
            margin: "0 auto",
            backgroundColor: design.contentBackgroundColor,
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <Section className="sc-pad" style={{ padding: "32px 40px" }}>
            {design.showLogo && logoUrl ? (
              <Img
                src={logoUrl}
                alt={BUSINESS_NAME}
                width="200"
                style={{ display: "block", margin: "0 0 28px", maxWidth: "200px" }}
              />
            ) : null}

            {blocks.map((block) => (
              <BlockView key={block.id} block={block} design={design} font={font} />
            ))}
          </Section>

          {/* Everything below is the compliance footer. It is not editable and
              not removable. */}
          <Hr style={{ border: "none", borderTop: "1px solid #e8e5e0", margin: 0 }} />
          <Section className="sc-pad" style={{ padding: "24px 40px 32px" }}>
            <Text style={{ fontSize: "12px", lineHeight: 1.6, color: "#8a8378", margin: "0 0 8px" }}>
              You are getting this because you asked us to email you about classes, events, and
              offers at {BUSINESS_NAME}.
            </Text>
            <Text style={{ fontSize: "12px", lineHeight: 1.6, color: "#8a8378", margin: "0 0 8px" }}>
              <Link
                href={UNSUBSCRIBE_PLACEHOLDER}
                style={{ color: "#8a8378", textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
            </Text>
            <Text style={{ fontSize: "12px", lineHeight: 1.6, color: "#8a8378", margin: 0 }}>
              {BUSINESS_NAME}, {BUSINESS_POSTAL_ADDRESS}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function BlockView({
  block,
  design,
  font,
}: {
  block: EmailBlock;
  design: EmailDesign;
  font: string;
}) {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? "28px" : block.level === 2 ? "22px" : "17px";
      const Tag = (`h${block.level}` as unknown) as "h1";
      // A native heading tag, not react-email's Heading: that one renders its
      // children, and React refuses an element carrying both children and
      // dangerouslySetInnerHTML.
      return (
        <Tag
          style={{
            fontFamily: font,
            fontSize: size,
            lineHeight: 1.3,
            fontWeight: 700,
            color: design.headingColor,
            textAlign: block.align,
            margin: "0 0 14px",
          }}
          // Inline markup only, sanitized on save.
          dangerouslySetInnerHTML={{ __html: styleLinks(block.text, design.linkColor) }}
        />
      );
    }

    case "text":
      // A plain div, not react-email's Section: Section wraps its children in a
      // table, and React refuses an element that has both children and
      // dangerouslySetInnerHTML. A div is rendered fine by every email client.
      return (
        <div
          style={{
            fontSize: "15px",
            lineHeight: 1.65,
            color: design.textColor,
            textAlign: block.align,
            margin: "0 0 16px",
          }}
          // Already sanitized on save by sanitize-email-html.ts.
          dangerouslySetInnerHTML={{ __html: styleLinks(block.html, design.linkColor) }}
        />
      );

    case "image": {
      if (!block.src) return null;
      const img = (
        <Img
          src={block.src}
          alt={block.alt}
          style={{
            display: "block",
            width: IMAGE_WIDTH[block.width],
            maxWidth: "100%",
            height: "auto",
            borderRadius: "8px",
            margin:
              block.align === "center" ? "0 auto" : block.align === "right" ? "0 0 0 auto" : "0",
          }}
        />
      );
      return (
        <Section style={{ margin: "0 0 20px" }}>
          {block.href ? <Link href={block.href}>{img}</Link> : img}
        </Section>
      );
    }

    case "button":
      return (
        <Section style={{ margin: "0 0 24px", textAlign: block.align }}>
          {/* A styled anchor rather than react-email's Button: Outlook renders
              the anchor's padding more predictably than the nested table. */}
          <Link
            href={block.href}
            style={{
              backgroundColor: design.buttonColor,
              color: design.buttonTextColor,
              padding: "13px 26px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {block.label}
          </Link>
        </Section>
      );

    case "divider":
      return <Hr style={{ border: "none", borderTop: "1px solid #e8e5e0", margin: "24px 0" }} />;

    case "spacer":
      return <Section style={{ height: `${SPACER_HEIGHT[block.size]}px`, lineHeight: `${SPACER_HEIGHT[block.size]}px` }}>&nbsp;</Section>;

    case "quote":
      return (
        <Section
          style={{
            borderLeft: `3px solid ${design.buttonColor}`,
            paddingLeft: "16px",
            margin: "0 0 20px",
          }}
        >
          <Text style={{ fontSize: "17px", lineHeight: 1.5, fontStyle: "italic", color: design.textColor, margin: 0 }}>
            {block.text}
          </Text>
          {block.attribution ? (
            <Text style={{ fontSize: "13px", color: "#8a8378", margin: "8px 0 0" }}>
              {block.attribution}
            </Text>
          ) : null}
        </Section>
      );

    case "columns": {
      const image = block.imageSrc ? (
        <Img
          src={block.imageSrc}
          alt={block.imageAlt}
          style={{ display: "block", width: "100%", maxWidth: "100%", height: "auto", borderRadius: "8px" }}
        />
      ) : null;

      const copy = (
        <>
          {block.title ? (
            <p
              style={{ fontSize: "17px", fontWeight: 700, color: design.headingColor, margin: "0 0 6px" }}
              dangerouslySetInnerHTML={{ __html: styleLinks(block.title, design.linkColor) }}
            />
          ) : null}
          {block.body ? (
            <div
              style={{ fontSize: "14px", lineHeight: 1.6, color: design.textColor }}
              // Sanitized on save, same as the text block.
              dangerouslySetInnerHTML={{ __html: styleLinks(block.body, design.linkColor) }}
            />
          ) : null}
          {block.href ? (
            <Text style={{ fontSize: "14px", margin: "8px 0 0" }}>
              <Link href={block.href} style={{ color: design.linkColor }}>
                Read more
              </Link>
            </Text>
          ) : null}
        </>
      );

      // The author picks how wide the image is; the text takes the rest.
      const imagePercent = Number(block.imageWidth);
      const onLeft = block.imagePosition === "left";

      const imageCell = (
        <Column
          className="sc-stack"
          style={{
            width: `${imagePercent}%`,
            verticalAlign: "top",
            // Padding goes on the inner edge only, so the image still sits
            // flush against the email's margin on its outer side.
            paddingRight: onLeft ? "16px" : undefined,
            paddingLeft: onLeft ? undefined : "16px",
          }}
        >
          {image}
        </Column>
      );
      const copyCell = (
        <Column className="sc-stack" style={{ width: `${100 - imagePercent}%`, verticalAlign: "top" }}>
          {copy}
        </Column>
      );

      return (
        <Section style={{ margin: "0 0 20px" }}>
          <Row>
            {onLeft ? imageCell : copyCell}
            {onLeft ? copyCell : imageCell}
          </Row>
        </Section>
      );
    }

    case "card":
      return (
        <Section
          style={{
            border: "1px solid #e8e5e0",
            borderRadius: "10px",
            overflow: "hidden",
            margin: "0 0 20px",
          }}
        >
          {block.imageSrc ? (
            <Img
              src={block.imageSrc}
              alt={block.imageAlt}
              style={{ display: "block", width: "100%", maxWidth: "100%", height: "auto" }}
            />
          ) : null}
          <Section style={{ padding: "18px 20px" }}>
            {block.title ? (
              <p
                style={{ fontSize: "18px", fontWeight: 700, color: design.headingColor, margin: "0 0 4px" }}
                dangerouslySetInnerHTML={{ __html: styleLinks(block.title, design.linkColor) }}
              />
            ) : null}
            {block.meta ? (
              <Text style={{ fontSize: "13px", color: "#8a8378", margin: "0 0 10px" }}>{block.meta}</Text>
            ) : null}
            {block.body ? (
              <Text style={{ fontSize: "14px", lineHeight: 1.6, color: design.textColor, margin: "0 0 14px" }}>
                {block.body}
              </Text>
            ) : null}
            {block.buttonHref && block.buttonLabel ? (
              <Link
                href={block.buttonHref}
                style={{
                  backgroundColor: design.buttonColor,
                  color: design.buttonTextColor,
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                {block.buttonLabel}
              </Link>
            ) : null}
          </Section>
        </Section>
      );

    case "social": {
      const links = [
        { label: "Instagram", href: block.instagram },
        { label: "Facebook", href: block.facebook },
        { label: "Website", href: block.website },
      ].filter((l) => l.href.trim());

      if (!links.length) return null;

      return (
        <Section style={{ margin: "0 0 20px", textAlign: "center" }}>
          <Text style={{ fontSize: "13px", margin: 0 }}>
            {links.map((l, i) => (
              <span key={l.label}>
                {i > 0 ? <span style={{ color: "#c9c3ba" }}>{"  ·  "}</span> : null}
                <Link href={l.href} style={{ color: design.linkColor, textDecoration: "underline" }}>
                  {l.label}
                </Link>
              </span>
            ))}
          </Text>
        </Section>
      );
    }

    default:
      return null;
  }
}

// Email clients do not inherit link color from a parent, and several default
// to a blue that clashes with anything. The editor's HTML carries no color of
// its own, so it is added here where the design tokens are in scope.
function styleLinks(html: string, color: string): string {
  return html.replace(/<a /gi, `<a style="color:${color}" `);
}
