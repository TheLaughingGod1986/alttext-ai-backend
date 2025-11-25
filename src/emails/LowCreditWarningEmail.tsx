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

interface LowCreditWarningEmailProps {
  brandName?: string;
  used: number;
  limit: number;
  plan?: string;
  resetDate?: string;
}

export const LowCreditWarningEmail = ({
  brandName = 'AltText AI',
  used,
  limit,
  plan = 'free',
  resetDate,
}: LowCreditWarningEmailProps) => {
  const remaining = limit - used;
  const percentage = Math.round((used / limit) * 100);

  return (
    <Html>
      <Head />
      <Preview>You're {percentage}% Through Your Free Plan! ⚡</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              You're {percentage}% Through Your Free Plan! ⚡
            </Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>Hi there!</Text>
            <Text style={paragraph}>
              You've used <strong>{used} of {limit}</strong> AI generations this
              month. Only <strong>{remaining} remaining</strong>!
            </Text>

            <Section style={warningBox}>
              <Text style={warningNumber}>{remaining}</Text>
              <Text style={warningLabel}>
                Generations Remaining This Month
              </Text>
            </Section>

            <Heading style={sectionTitle}>🚀 Need More? Upgrade to Pro!</Heading>
            <ul style={list}>
              <li>
                <strong>1,000 generations per month</strong>
              </li>
              <li>Priority processing</li>
              <li>Advanced AI models</li>
              <li>Priority support</li>
            </ul>

            <Section style={buttonContainer}>
              <Button href="https://alttextai.com/upgrade" style={button}>
                Upgrade Now
              </Button>
            </Section>

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

LowCreditWarningEmail.PreviewProps = {
  brandName: 'AltText AI',
  used: 35,
  limit: 50,
  plan: 'free',
} as LowCreditWarningEmailProps;

export default LowCreditWarningEmail;

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
  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
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

const warningBox = {
  background: '#fffbeb',
  border: '2px solid #fbbf24',
  padding: '20px',
  margin: '25px 0',
  borderRadius: '8px',
  textAlign: 'center' as const,
};

const warningNumber = {
  fontSize: '48px',
  fontWeight: 'bold',
  color: '#d97706',
  marginBottom: '10px',
  margin: 0,
};

const warningLabel = {
  fontSize: '14px',
  color: '#92400e',
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

