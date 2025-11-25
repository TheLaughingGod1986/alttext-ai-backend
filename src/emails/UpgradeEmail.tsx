import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface UpgradeEmailProps {
  brandName?: string;
  plan?: string;
  planName?: string;
}

export const UpgradeEmail = ({
  brandName = 'AltText AI',
  plan = 'pro',
  planName,
}: UpgradeEmailProps) => {
  const displayPlanName = planName || plan.charAt(0).toUpperCase() + plan.slice(1);
  const monthlyQuota = plan === 'agency' ? 10000 : 1000;

  return (
    <Html>
      <Head />
      <Preview>Thank You for Upgrading! 🎊</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              Thank You for Upgrading! 🎊
            </Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>
              Welcome to {brandName} {displayPlanName}!
            </Text>
            <Text style={paragraph}>
              Thank you for upgrading! You now have access to premium features
              and significantly more AI generations.
            </Text>

            <Section style={featuresBox}>
              <Text style={featuresTitle}>
                🎁 Your {displayPlanName} Plan Includes:
              </Text>
              <ul style={list}>
                <li>
                  <strong>{monthlyQuota.toLocaleString()} AI generations</strong>{' '}
                  per month
                </li>
                <li>Advanced AI models for better accuracy</li>
                <li>Priority processing</li>
                <li>Priority email support</li>
                <li>Early access to new features</li>
              </ul>
            </Section>

            <Section style={activeBox}>
              <Text style={activeTitle}>
                🚀 <strong>Your new limits are active now!</strong>
              </Text>
              <Text style={activeSubtitle}>
                Start generating alt text right away
              </Text>
            </Section>

            <Text style={paragraph}>
              Head to your WordPress dashboard to start taking full advantage of
              your upgraded plan!
            </Text>

            <Section style={divider} />
            <Text style={footerText}>
              Questions? Reach out to our priority support team anytime.
            </Text>
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

UpgradeEmail.PreviewProps = {
  brandName: 'AltText AI',
  plan: 'pro',
  planName: 'Pro',
} as UpgradeEmailProps;

export default UpgradeEmail;

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
  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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

const featuresBox = {
  background: '#f0fdf4',
  borderLeft: '4px solid #10b981',
  padding: '20px',
  margin: '25px 0',
  borderRadius: '4px',
};

const featuresTitle = {
  margin: 0,
  fontWeight: 600,
  color: '#10b981',
  fontSize: '16px',
};

const list = {
  margin: '10px 0 0 0',
  paddingLeft: '20px',
  color: '#1e293b',
  lineHeight: 1.8,
};

const activeBox = {
  background: '#eff6ff',
  padding: '20px',
  margin: '25px 0',
  borderRadius: '8px',
  textAlign: 'center' as const,
};

const activeTitle = {
  margin: 0,
  fontSize: '18px',
  color: '#1e40af',
};

const activeSubtitle = {
  margin: '10px 0 0 0',
  fontSize: '14px',
  color: '#3b82f6',
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

