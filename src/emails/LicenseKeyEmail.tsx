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

interface LicenseKeyEmailProps {
  brandName?: string;
  name?: string;
  licenseKey: string;
  plan?: string;
  maxSites?: number;
  monthlyQuota?: number;
}

export const LicenseKeyEmail = ({
  brandName = 'AltText AI',
  name,
  licenseKey,
  plan = 'agency',
  maxSites = 10,
  monthlyQuota = 10000,
}: LicenseKeyEmailProps) => {
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <Html>
      <Head />
      <Preview>Your {brandName} {planName} License Key</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>
              🎉 Your {brandName} {planName} License
            </Heading>
            <Text style={headerSubtitle}>Welcome to the team!</Text>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>Hi {name || 'there'},</Text>
            <Text style={paragraph}>
              Thank you for upgrading to {brandName} {planName}! Your license
              is ready to use.
            </Text>

            <Heading style={sectionTitle}>Your License Key</Heading>
            <Section style={licenseKeyBox}>
              <Text style={licenseKeyText}>{licenseKey}</Text>
            </Section>
            <Text style={licenseKeyHint}>
              Copy this key - you'll need it to activate your sites
            </Text>

            <Section style={featuresBox}>
              <Heading style={featuresTitle}>
                Your {planName} Plan Includes:
              </Heading>
              <ul style={list}>
                <li>
                  <strong>{monthlyQuota.toLocaleString()} AI generations</strong>{' '}
                  per month
                </li>
                <li>
                  <strong>Use on up to {maxSites} sites</strong>
                </li>
                <li>
                  <strong>Shared quota</strong> across all sites
                </li>
                <li>
                  <strong>Self-service site management</strong>
                </li>
                <li>
                  <strong>Priority support</strong>
                </li>
              </ul>
            </Section>

            <Heading style={sectionTitle}>Activation Instructions</Heading>
            <Section style={steps}>
              <Section style={step}>
                <Text style={stepNumber}>1</Text>
                <Text style={stepText}>
                  <strong>Log into your WordPress admin panel</strong>
                  <br />
                  <span style={stepHint}>
                    Go to any site where you want to use {brandName}
                  </span>
                </Text>
              </Section>
              <Section style={step}>
                <Text style={stepNumber}>2</Text>
                <Text style={stepText}>
                  <strong>Navigate to {brandName} → License tab</strong>
                  <br />
                  <span style={stepHint}>
                    You'll find this in your WordPress dashboard menu
                  </span>
                </Text>
              </Section>
              <Section style={step}>
                <Text style={stepNumber}>3</Text>
                <Text style={stepText}>
                  <strong>Paste your license key</strong>
                  <br />
                  <span style={stepHint}>
                    Copy the key above and paste it in the activation form
                  </span>
                </Text>
              </Section>
              <Section style={step}>
                <Text style={stepNumber}>4</Text>
                <Text style={stepText}>
                  <strong>Click "Activate License"</strong>
                  <br />
                  <span style={stepHint}>
                    Your site will be activated instantly!
                  </span>
                </Text>
              </Section>
            </Section>

            <Section style={tipBox}>
              <Text style={tipText}>
                <strong>💡 Pro Tip:</strong> You can use the same license key
                on all {maxSites} of your sites. They'll all share the{' '}
                {monthlyQuota.toLocaleString()} monthly generation quota.
              </Text>
            </Section>

            <Text style={paragraph}>
              Your quota is active now! Start generating professional alt text
              for all your client sites.
            </Text>

            <Section style={buttonContainer}>
              <Link href="https://docs.alttextai.com/license" style={button}>
                View Full Documentation
              </Link>
            </Section>

            <Heading style={sectionTitle}>Need Help?</Heading>
            <Text style={paragraph}>We're here to support you:</Text>
            <ul style={list}>
              <li>
                📖{' '}
                <Link href="https://docs.alttextai.com" style={link}>
                  Documentation
                </Link>
              </li>
              <li>
                💬{' '}
                <Link href="https://alttextai.com/support" style={link}>
                  Contact Support
                </Link>
              </li>
              <li>📧 Reply to this email with any questions</li>
            </ul>

            <Text style={signature}>
              Best regards,
              <br />
              The {brandName} Team
            </Text>
          </Section>
        </Container>
        <Section style={footer}>
          <Text style={footerText}>
            {brandName} - Professional Alt Text for WordPress
          </Text>
          <Text style={footerText}>
            This email contains your license key. Please save it in a secure
            location.
          </Text>
        </Section>
      </Body>
    </Html>
  );
};

LicenseKeyEmail.PreviewProps = {
  brandName: 'AltText AI',
  name: 'John Doe',
  licenseKey: 'lic_1234567890abcdef',
  plan: 'agency',
  maxSites: 10,
  monthlyQuota: 10000,
} as LicenseKeyEmailProps;

export default LicenseKeyEmail;

const main = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
  color: '#ffffff',
  padding: '30px',
  borderRadius: '10px 10px 0 0',
  textAlign: 'center' as const,
};

const headerTitle = {
  margin: 0,
  fontSize: '28px',
  color: '#ffffff',
};

const headerSubtitle = {
  margin: '10px 0 0 0',
  opacity: 0.9,
  fontSize: '16px',
  color: '#ffffff',
};

const content = {
  background: '#ffffff',
  padding: '30px',
  border: '1px solid #e1e4e8',
  borderTop: 'none',
  borderRadius: '0 0 10px 10px',
};

const paragraph = {
  fontSize: '16px',
  margin: '0 0 16px 0',
  color: '#333',
};

const sectionTitle = {
  color: '#667eea',
  marginTop: '30px',
  fontSize: '20px',
  marginBottom: '16px',
};

const licenseKeyBox = {
  background: '#f6f8fa',
  border: '2px solid #667eea',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px 0',
  textAlign: 'center' as const,
};

const licenseKeyText = {
  fontFamily: "'Courier New', monospace",
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#667eea',
  wordBreak: 'break-all' as const,
  margin: 0,
};

const licenseKeyHint = {
  textAlign: 'center' as const,
  fontSize: '14px',
  color: '#666',
  margin: '0 0 20px 0',
};

const featuresBox = {
  background: '#f6f8fa',
  borderLeft: '4px solid #667eea',
  padding: '15px 20px',
  margin: '20px 0',
};

const featuresTitle = {
  marginTop: 0,
  color: '#667eea',
  fontSize: '18px',
};

const list = {
  margin: '10px 0',
  paddingLeft: '20px',
  color: '#1e293b',
};

const steps = {
  counterReset: 'step-counter',
};

const step = {
  counterIncrement: 'step-counter',
  margin: '15px 0',
  paddingLeft: '40px',
  position: 'relative' as const,
};

const stepNumber = {
  position: 'absolute' as const,
  left: 0,
  top: 0,
  background: '#667eea',
  color: '#ffffff',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  textAlign: 'center' as const,
  lineHeight: '28px',
  fontWeight: 'bold',
  fontSize: '14px',
  margin: 0,
};

const stepText = {
  margin: 0,
  color: '#333',
};

const stepHint = {
  color: '#666',
  fontSize: '14px',
};

const tipBox = {
  background: '#fff3cd',
  borderLeft: '4px solid #ffc107',
  padding: '15px',
  margin: '20px 0',
  borderRadius: '4px',
};

const tipText = {
  margin: 0,
  color: '#856404',
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

const link = {
  color: '#667eea',
  textDecoration: 'none',
};

const signature = {
  marginTop: '30px',
  fontSize: '14px',
  color: '#333',
};

const footer = {
  textAlign: 'center' as const,
  color: '#666',
  fontSize: '12px',
  marginTop: '30px',
  paddingTop: '20px',
  borderTop: '1px solid #e1e4e8',
};

const footerText = {
  margin: '4px 0',
  color: '#666',
};

