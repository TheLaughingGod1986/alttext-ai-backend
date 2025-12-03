import {
  Body,
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

interface PluginSignupEmailProps {
  brandName?: string;
  name?: string;
  plugin?: string;
  installId?: string;
}

export const PluginSignupEmail = ({
  brandName = 'AltText AI',
  name,
  plugin,
  installId,
}: PluginSignupEmailProps) => {
  const greeting = name ? `Hi ${name}!` : 'Hi there!';
  const pluginName = plugin || 'AltText AI';

  return (
    <Html>
      <Head />
      <Preview>Welcome to {pluginName}! 🎉</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              Welcome to {pluginName}! 🎉
            </Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>{greeting}</Text>
            <Text style={paragraph}>
              Thank you for installing <strong>{pluginName}</strong>! We're
              excited to help you automate your alt text generation and improve
              your website's SEO.
            </Text>

            <Section style={infoBox}>
              <Text style={infoBoxTitle}>🚀 Quick Start:</Text>
              <ul style={list}>
                <li>Your plugin is now active and ready to use</li>
                <li>Alt text will generate automatically on image upload</li>
                <li>You can also bulk process existing images</li>
                <li>Check your dashboard for usage statistics</li>
              </ul>
            </Section>

            <Section style={infoBoxGreen}>
              <Text style={infoBoxTitleGreen}>✨ What's Included:</Text>
              <ul style={list}>
                <li>
                  <strong>50 AI generations per month</strong> (free plan)
                </li>
                <li>Automatic generation on upload</li>
                <li>Bulk processing support</li>
                <li>WCAG-compliant alt text</li>
                <li>Dashboard and analytics</li>
              </ul>
            </Section>

            {installId && (
              <Section style={infoBox}>
                <Text style={infoBoxTitle}>📋 Installation Details:</Text>
                <Text style={paragraph}>
                  Installation ID: <strong>{installId}</strong>
                </Text>
              </Section>
            )}

            <Text style={paragraph}>
              Ready to get started? Upload an image to WordPress and watch the
              magic happen!
            </Text>

            <Section style={divider} />
            <Text style={footerText}>
              Need help? Check out our{' '}
              <Link href="https://alttextai.com/docs" style={link}>
                documentation
              </Link>{' '}
              or reach out to support.
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

PluginSignupEmail.PreviewProps = {
  brandName: 'AltText AI',
  name: 'John',
  plugin: 'AltText AI',
  installId: 'wp_123456',
} as PluginSignupEmailProps;

export default PluginSignupEmail;

const main = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
  lineHeight: 1.6,
  color: '#333',
  margin: '0 0 16px 0',
};

const infoBox = {
  background: '#f0f9ff',
  borderLeft: '4px solid #667eea',
  padding: '15px',
  margin: '25px 0',
  borderRadius: '4px',
};

const infoBoxTitle = {
  margin: 0,
  fontWeight: 600,
  color: '#667eea',
  fontSize: '16px',
};

const infoBoxGreen = {
  background: '#f0fdf4',
  borderLeft: '4px solid #10b981',
  padding: '15px',
  margin: '25px 0',
  borderRadius: '4px',
};

const infoBoxTitleGreen = {
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

const link = {
  color: '#667eea',
  textDecoration: 'none',
};

const signature = {
  fontSize: '12px',
  color: '#9ca3af',
  textAlign: 'center' as const,
  marginTop: '30px',
  margin: 0,
};

