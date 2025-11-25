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

interface PasswordResetEmailProps {
  brandName?: string;
  resetUrl: string;
}

export const PasswordResetEmail = ({
  brandName = 'AltText AI',
  resetUrl,
}: PasswordResetEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Reset Your {brandName} Password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>Reset Your Password</Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>
              You requested to reset your password for {brandName}.
            </Text>
            <Text style={paragraph}>
              Click the button below to reset your password:
            </Text>

            <Section style={buttonContainer}>
              <Button href={resetUrl} style={button}>
                Reset Password
              </Button>
            </Section>

            <Text style={linkText}>
              Or copy and paste this link into your browser:
            </Text>
            <Section style={urlBox}>
              <Text style={urlText}>{resetUrl}</Text>
            </Section>

            <Text style={warningText}>
              This link will expire in 1 hour.
            </Text>
            <Text style={warningText}>
              If you didn't request this, please ignore this email.
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

PasswordResetEmail.PreviewProps = {
  brandName: 'AltText AI',
  resetUrl: 'https://alttextai.com/reset-password?token=abc123',
} as PasswordResetEmailProps;

export default PasswordResetEmail;

const main = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  lineHeight: 1.6,
  color: '#333',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '20px',
};

const header = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '30px',
  textAlign: 'center' as const,
  borderRadius: '8px 8px 0 0',
};

const headerTitle = {
  color: '#ffffff',
  margin: 0,
  fontSize: '24px',
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
  margin: '0 0 16px 0',
  color: '#333',
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
  padding: '12px 30px',
  borderRadius: '6px',
  fontWeight: 600,
};

const linkText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '16px 0 8px 0',
};

const urlBox = {
  background: '#f3f4f6',
  padding: '10px',
  borderRadius: '4px',
  margin: '0 0 16px 0',
};

const urlText = {
  fontSize: '12px',
  wordBreak: 'break-all' as const,
  color: '#9ca3af',
  margin: 0,
};

const warningText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0 0 8px 0',
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

