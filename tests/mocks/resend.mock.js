const jestMock = require('jest-mock');

let lastInstance = null;

class ResendMock {
  constructor() {
    // Standardized email send - always returns { success: true } by default
    this.emails = {
      send: jestMock.fn().mockResolvedValue({ 
        id: 'resend_email_test', 
        success: true 
      })
    };

    this.contacts = {
      create: jestMock.fn().mockResolvedValue({ id: 'contact_test', success: true }),
      remove: jestMock.fn().mockResolvedValue({ success: true })
    };
  }
}

function createResendInstance() {
  lastInstance = new ResendMock();
  return lastInstance;
}

const ResendClass = jestMock.fn(() => createResendInstance());

function resetResend() {
  if (lastInstance) {
    // Reset emails.send to default success response
    lastInstance.emails.send.mockReset().mockResolvedValue({ 
      id: 'resend_email_test', 
      success: true 
    });
    
    // Reset contacts
    lastInstance.contacts.create.mockReset().mockResolvedValue({ 
      id: 'contact_test', 
      success: true 
    });
    lastInstance.contacts.remove.mockReset().mockResolvedValue({ success: true });
  }
  ResendClass.mockClear();
}

/**
 * Helper to set email send to fail (for testing error cases)
 */
function setEmailSendToFail(error = new Error('Email send failed')) {
  if (lastInstance) {
    lastInstance.emails.send.mockRejectedValue(error);
  }
}

/**
 * Helper to set email send to succeed (default behavior)
 */
function setEmailSendToSucceed(response = { id: 'resend_email_test', success: true }) {
  if (lastInstance) {
    lastInstance.emails.send.mockResolvedValue(response);
  }
}

module.exports = {
  Resend: ResendClass,
  __resetResend: resetResend,
  __getLastInstance: () => lastInstance,
  __setEmailSendToFail: setEmailSendToFail,
  __setEmailSendToSucceed: setEmailSendToSucceed
};

