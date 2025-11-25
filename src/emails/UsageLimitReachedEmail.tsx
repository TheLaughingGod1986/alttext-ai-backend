import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface UsageLimitReachedEmailProps {
  brandName?: string;
  limit: number;
  plan?: string;
  resetDate?: string;
}

export const UsageLimitReachedEmail = ({
  brandName = 'AltText AI',
  limit,
  plan = 'free',
  resetDate,
}: UsageLimitReachedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>You've Reached Your Free Plan Limit 🚀</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              You've Reached Your Free Plan Limit 🚀
            </Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>Hi there!</Text>
            <Text style={paragraph}>
              You've used all <strong>{limit} AI generations</strong> included
              in your free plan this month. Great job optimizing your images!
            </Text>

            <Section style={limitBox}>
              <Text style={limitNumber}>0</Text>
              <Text style={limitLabel}>Generations Remaining</Text>
              {resetDate && (
                <Text style={resetDateText}>Resets: {resetDate}</Text>
              )}
            </Section>

            <Heading style={sectionTitle}>
              💎 Unlock Unlimited Potential with Pro!
            </Heading>
            <ul style={list}>
              <li>
                <strong>1,000 generations per month</strong> (20x more!)
              </li>
              <li>Never run out again</li>
              <li>Advanced AI models for better results</li>
              <li>Priority processing & support</li>
            </ul>

            <Section style={buttonContainer}>
              <Button href="https://alttextai.com/upgrade" style={button}>
                Upgrade to Pro Now
              </Button>
            </Section>

            <Text style={alternativeText}>
              Or wait until next month when your free plan resets.
            </Text>

            <Section style={divider} />
            <Text style={signature}>
              Best regards,
              <br />
              The {brandName} Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

UsageLimitReachedEmail.PreviewProps = {
  brandName: 'AltText AI',
  limit: 50,
  plan: 'free',
  resetDate: '2024-02-01',
} as UsageLimitReachedEmailProps;

export default UsageLimitReachedEmail;

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
  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
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

const limitBox = {
  background: '#fef2f2',
  border: '2px solid #f87171',
  padding: '20px',
  margin: '25px 0',
  borderRadius: '8px',
  textAlign: 'center' as const,
};

const limitNumber = {
  fontSize: '48px',
  fontWeight: 'bold',
  color: '#dc2626',
  marginBottom: '10px',
  margin: 0,
};

const limitLabel = {
  fontSize: '14px',
  color: '#991b1b',
  margin: 0,
};

const resetDateText = {
  fontSize: '12px',
  color: '#b91c1c',
  marginTop: '10px',
  margin: 0,
};

const sectionTitle = {
  color: '#667eea',
  marginTop: '30px',
  fontSize: '20px',
  marginBottom: '16px',
};

const list = {
  color: '#1e293b',
  lineHeight: 1.8,
  margin: '16px 0',
  paddingLeft: '20px',
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

const alternativeText = {
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

const signature = {
  fontSize: '12px',
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: 0,
};

