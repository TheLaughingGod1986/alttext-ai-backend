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

interface ReceiptEmailProps {
  brandName?: string;
  name?: string;
  amount: number;
  currency?: string;
  plan: string;
  transactionId: string;
  date: string;
}

export const ReceiptEmail = ({
  brandName = 'AltText AI',
  name,
  amount,
  currency = 'USD',
  plan,
  transactionId,
  date,
}: ReceiptEmailProps) => {
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);

  return (
    <Html>
      <Head />
      <Preview>Payment Receipt - {formattedAmount}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={headerTitle}>Payment Receipt</Heading>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>
              {name ? `Hi ${name},` : 'Hi there,'}
            </Text>
            <Text style={paragraph}>
              Thank you for your payment! Your receipt is below.
            </Text>

            <Section style={receiptBox}>
              <Text style={receiptTitle}>Transaction Details</Text>
              <Section style={receiptRow}>
                <Text style={receiptLabel}>Amount:</Text>
                <Text style={receiptValue}>{formattedAmount}</Text>
              </Section>
              <Section style={receiptRow}>
                <Text style={receiptLabel}>Plan:</Text>
                <Text style={receiptValue}>{planName}</Text>
              </Section>
              <Section style={receiptRow}>
                <Text style={receiptLabel}>Transaction ID:</Text>
                <Text style={receiptValue}>{transactionId}</Text>
              </Section>
              <Section style={receiptRow}>
                <Text style={receiptLabel}>Date:</Text>
                <Text style={receiptValue}>{date}</Text>
              </Section>
            </Section>

            <Text style={paragraph}>
              Your {planName} plan is now active! You can start using all the
              premium features immediately.
            </Text>

            <Section style={divider} />
            <Text style={footerText}>
              If you have any questions about this receipt, please contact our
              support team.
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

ReceiptEmail.PreviewProps = {
  brandName: 'AltText AI',
  name: 'John Doe',
  amount: 29.99,
  currency: 'USD',
  plan: 'pro',
  transactionId: 'txn_1234567890',
  date: new Date().toLocaleDateString(),
} as ReceiptEmailProps;

export default ReceiptEmail;

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
  margin: '0 0 16px 0',
  color: '#333',
};

const receiptBox = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '20px',
  margin: '25px 0',
};

const receiptTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 16px 0',
  color: '#333',
};

const receiptRow = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '12px',
  paddingBottom: '12px',
  borderBottom: '1px solid #e5e7eb',
};

const receiptLabel = {
  fontSize: '14px',
  color: '#6b7280',
  margin: 0,
  fontWeight: 500,
};

const receiptValue = {
  fontSize: '14px',
  color: '#333',
  margin: 0,
  fontWeight: 600,
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

