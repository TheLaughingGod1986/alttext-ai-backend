import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface InactiveEmailProps {
  brandName?: string;
  daysInactive?: number;
}

export const InactiveEmail = ({
  brandName = 'AltText AI',
  daysInactive = 30,
}: InactiveEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>We Miss You! Come Back to {brandName} 💙</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              We Miss You! Come Back to {brandName} 💙
            </Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>Hi there!</Text>
            <Text style={paragraph}>
              We noticed you haven't used {brandName} in the last {daysInactive}{' '}
              days. We'd love to help you get back to optimizing your images!
            </Text>

            <Section style={infoBox}>
              <Text style={infoBoxTitle}>🎯 Quick Wins with {brandName}:</Text>
              <ul style={list}>
                <li>Rank higher in Google Image Search</li>
                <li>Make your site more accessible</li>
                <li>Save hours of manual work</li>
                <li>Improve SEO with zero effort</li>
              </ul>
            </Section>

            <Section style={buttonContainer}>
              <Button href="https://alttextai.com/login" style={button}>
                Log In Now
              </Button>
            </Section>

            <Text style={reminderText}>
              Your free plan is still active and ready to use!
            </Text>

            <Section style={divider} />
            <Text style={footerText}>
              Need help getting started? Our support team is here for you.
            </Text>
            <Text style={signature}>
              Best regards,
              <br />
              The {brandName} Team
            </Text>
            <Text style={unsubscribeText}>
              <Link href="https://alttextai.com/unsubscribe" style={unsubscribeLink}>
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

InactiveEmail.PreviewProps = {
  brandName: 'AltText AI',
  daysInactive: 30,
} as InactiveEmailProps;

export default InactiveEmail;

const main = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  lineHeight: 1.6,
  color: '#333',
  backgroundColor: '#f9fafb',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '20px',
};

const header = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '40px 30px',
  textAlign: 'center' as const,
  borderRadius: '8px 8px 0 0',
};

const headerTitle = {
  color: '#ffffff',
  margin: 0,
  fontSize: '28px',
};

const content = {
  background: '#ffffff',
  padding: '30px',
  border: '1px solid #e5e7eb',
  borderTop: 'none',
  borderRadius: '0 0 8px 8px',
};

const paragraph = {
  fontSize: '16px',
  marginTop: 0,
  marginBottom: '16px',
  color: '#333',
};

const infoBox = {
  background: '#f0f9ff',
  borderLeft: '4px solid #667eea',
  padding: '20px',
  margin: '25px 0',
  borderRadius: '4px',
};

const infoBoxTitle = {
  margin: 0,
  fontWeight: 600,
  color: '#667eea',
  fontSize: '16px',
};

const list = {
  margin: '10px 0 0 0',
  paddingLeft: '20px',
  color: '#1e293b',
  lineHeight: 1.8,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
};

const button = {
  display: 'inline-block',
  background: '#667eea',
  color: '#ffffff',
  textDecoration: 'none',
  padding: '14px 32px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '16px',
};

const reminderText = {
  fontSize: '14px',
  color: '#6b7280',
  textAlign: 'center' as const,
  margin: '16px 0',
};

const divider = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '30px 0',
};

const footerText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0 0 16px 0',
};

const signature = {
  fontSize: '12px',
  color: '#9ca3af',
  textAlign: 'center' as const,
  marginTop: '30px',
  margin: 0,
};

const unsubscribeText = {
  fontSize: '11px',
  color: '#d1d5db',
  textAlign: 'center' as const,
  marginTop: '20px',
  margin: 0,
};

const unsubscribeLink = {
  color: '#9ca3af',
  textDecoration: 'underline',
};

