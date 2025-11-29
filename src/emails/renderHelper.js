/**
 * Helper module for rendering React Email templates
 * Handles the rendering of TSX email templates to HTML and text
 */

const { render } = require('@react-email/render');
const React = require('react');

// Register ts-node to handle TypeScript/TSX files
let tsNodeRegistered = false;
try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      jsx: 'react',
      module: 'commonjs',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  });
  tsNodeRegistered = true;
} catch (error) {
  // ts-node not available, will try compiled JS or fallback
  console.warn('[Email Render Helper] ts-node not available, will try compiled JS');
}

// Import email templates
let WelcomeEmail, LicenseActivatedEmail, LowCreditWarningEmail, ReceiptEmail, 
    PluginSignupEmail, UsageLimitReachedEmail, UpgradeEmail, InactiveEmail, 
    LicenseKeyEmail, PasswordResetEmail;

try {
  // Try to load compiled templates from dist/ first (production build)
  let emails;
  try {
    emails = require('./dist');
  } catch (distError) {
    // Fall back to index.ts/index.js if dist doesn't exist (development)
    emails = require('./index');
  }
  
  WelcomeEmail = emails.WelcomeEmail || emails.WelcomeEmailDefault;
  LicenseActivatedEmail = emails.LicenseActivatedEmail || emails.LicenseActivatedEmailDefault;
  LowCreditWarningEmail = emails.LowCreditWarningEmail || emails.LowCreditWarningEmailDefault;
  ReceiptEmail = emails.ReceiptEmail || emails.ReceiptEmailDefault;
  PluginSignupEmail = emails.PluginSignupEmail || emails.PluginSignupEmailDefault;
  UsageLimitReachedEmail = emails.UsageLimitReachedEmail || emails.UsageLimitReachedEmailDefault;
  UpgradeEmail = emails.UpgradeEmail || emails.UpgradeEmailDefault;
  InactiveEmail = emails.InactiveEmail || emails.InactiveEmailDefault;
  LicenseKeyEmail = emails.LicenseKeyEmail || emails.LicenseKeyEmailDefault;
  PasswordResetEmail = emails.PasswordResetEmail || emails.PasswordResetEmailDefault;
} catch (error) {
  console.warn('[Email Render Helper] Could not load React Email templates:', error.message);
  console.warn('[Email Render Helper] Falling back to inline HTML templates');
}

/**
 * Get brand name from environment variable
 */
function getBrandName() {
  const { brandName } = require('./emailConfig');
  return brandName;
}

/**
 * Render a React Email component to HTML
 * @param {React.Component} Component - React Email component
 * @param {Object} props - Component props
 * @returns {Promise<string>} Rendered HTML
 */
async function renderEmailToHTML(Component, props) {
  if (!Component) {
    throw new Error('Email component not available');
  }

  try {
    const html = await render(React.createElement(Component, props));
    return html;
  } catch (error) {
    console.error('[Email Render Helper] Error rendering email to HTML:', error);
    throw error;
  }
}

/**
 * Render a React Email component to plain text
 * @param {React.Component} Component - React Email component
 * @param {Object} props - Component props
 * @returns {Promise<string>} Rendered plain text
 */
async function renderEmailToText(Component, props) {
  if (!Component) {
    throw new Error('Email component not available');
  }

  try {
    const text = await render(React.createElement(Component, props), {
      plainText: true,
    });
    return text;
  } catch (error) {
    console.error('[Email Render Helper] Error rendering email to text:', error);
    throw error;
  }
}

/**
 * Render welcome email
 */
async function renderWelcomeEmail(props) {
  if (!WelcomeEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(WelcomeEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(WelcomeEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render license activated email
 */
async function renderLicenseActivatedEmail(props) {
  if (!LicenseActivatedEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(LicenseActivatedEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(LicenseActivatedEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render low credit warning email
 */
async function renderLowCreditWarningEmail(props) {
  if (!LowCreditWarningEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(LowCreditWarningEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(LowCreditWarningEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render receipt email
 */
async function renderReceiptEmail(props) {
  if (!ReceiptEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(ReceiptEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(ReceiptEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render plugin signup email
 */
async function renderPluginSignupEmail(props) {
  if (!PluginSignupEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(PluginSignupEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(PluginSignupEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render usage limit reached email
 */
async function renderUsageLimitReachedEmail(props) {
  if (!UsageLimitReachedEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(UsageLimitReachedEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(UsageLimitReachedEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render upgrade email
 */
async function renderUpgradeEmail(props) {
  if (!UpgradeEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(UpgradeEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(UpgradeEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render inactive email
 */
async function renderInactiveEmail(props) {
  if (!InactiveEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(InactiveEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(InactiveEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render license key email
 */
async function renderLicenseKeyEmail(props) {
  if (!LicenseKeyEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(LicenseKeyEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(LicenseKeyEmail, { ...props, brandName: getBrandName() }),
  };
}

/**
 * Render password reset email
 */
async function renderPasswordResetEmail(props) {
  if (!PasswordResetEmail) {
    return null;
  }
  return {
    html: await renderEmailToHTML(PasswordResetEmail, { ...props, brandName: getBrandName() }),
    text: await renderEmailToText(PasswordResetEmail, { ...props, brandName: getBrandName() }),
  };
}

module.exports = {
  renderWelcomeEmail,
  renderLicenseActivatedEmail,
  renderLowCreditWarningEmail,
  renderReceiptEmail,
  renderPluginSignupEmail,
  renderUsageLimitReachedEmail,
  renderUpgradeEmail,
  renderInactiveEmail,
  renderLicenseKeyEmail,
  renderPasswordResetEmail,
  getBrandName,
  // Export components for direct use if needed
  WelcomeEmail,
  LicenseActivatedEmail,
  LowCreditWarningEmail,
  ReceiptEmail,
  PluginSignupEmail,
  UsageLimitReachedEmail,
  UpgradeEmail,
  InactiveEmail,
  LicenseKeyEmail,
  PasswordResetEmail,
};

