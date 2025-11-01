# Password Reset Backend Setup

## ✅ What's Been Implemented

### Database Schema
- Added `PasswordResetToken` model to Prisma schema
- Token expires after 1 hour
- Tokens are marked as used after password reset
- Rate limiting: max 3 reset requests per hour per user

### API Endpoints

#### 1. **POST /auth/forgot-password**
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Features:**
- Always returns success to prevent email enumeration
- Rate limiting (3 requests/hour per user)
- Invalidates previous unused tokens
- Generates secure 64-character hex token
- Token valid for 1 hour

#### 2. **POST /auth/reset-password**
Reset password with token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "token": "64-character-hex-token",
  "newPassword": "newsecurepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now login with your new password."
}
```

**Validation:**
- Email, token, and password required
- Password must be at least 8 characters
- Token must be valid and not expired
- Token must not be already used

## 📧 Email Service (Currently Mocked)

The password reset email is currently logged to the console. For production:

1. **Option 1: SendGrid** (Recommended - Easy setup)
   ```bash
   npm install @sendgrid/mail
   ```
   Set `SENDGRID_API_KEY` in environment variables

2. **Option 2: Resend** (Modern & Simple)
   ```bash
   npm install resend
   ```
   Set `RESEND_API_KEY` in environment variables

3. **Option 3: AWS SES**
   ```bash
   npm install aws-sdk
   ```
   Configure AWS credentials

4. **Option 4: Mailgun**
   ```bash
   npm install mailgun-js
   ```
   Set `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`

## 🚀 Deployment Steps

### 1. Update Database Schema
```bash
cd backend
npx prisma generate
npx prisma db push
```

### 2. Deploy to Render
1. Push code to repository
2. Render will auto-deploy
3. Database migration runs automatically

### 3. Set Environment Variables
- `FRONTEND_URL`: Your WordPress site URL (e.g., `https://yoursite.com`)

## 🧪 Testing

### Test Forgot Password
```bash
curl -X POST https://alttext-ai-backend.onrender.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Test Reset Password
```bash
# First get a token from the forgot-password endpoint (check console logs)
curl -X POST https://alttext-ai-backend.onrender.com/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "token":"your-reset-token-here",
    "newPassword":"newpassword123"
  }'
```

## 🔒 Security Features

1. **Email Enumeration Protection**: Always returns success, even if email doesn't exist
2. **Rate Limiting**: Max 3 reset requests per hour
3. **Token Expiration**: Tokens expire after 1 hour
4. **One-Time Use**: Tokens are invalidated after use
5. **Secure Token Generation**: Uses crypto.randomBytes(32)
6. **Password Requirements**: Minimum 8 characters

## 📝 Frontend Integration

The WordPress plugin frontend is already configured to use:
- `POST /auth/forgot-password` - via `ajax_forgot_password()` 
- `POST /auth/reset-password` - via `ajax_reset_password()`

Both are handled in:
- `includes/class-api-client-v2.php` (PHP API client)
- `assets/auth-modal.js` (Frontend UI)

## ⚠️ Current Limitations

1. **Email Service**: Currently mocked (logs to console)
   - In production, integrate real email service
   - See `backend/auth/email.js` for integration guide

2. **Reset URL**: Uses `FRONTEND_URL` environment variable
   - Defaults to `https://alttextai.com` if not set
   - Should point to WordPress admin or custom reset page

## 🔄 Next Steps

1. **Deploy Database Changes**
   ```bash
   npx prisma db push
   ```

2. **Set FRONTEND_URL in Render**
   - Go to Render dashboard → Environment
   - Add: `FRONTEND_URL=https://yoursite.com`

3. **Integrate Real Email Service** (Optional for now)
   - Choose email service (SendGrid recommended)
   - Update `backend/auth/email.js`
   - Add API key to Render environment variables

4. **Test Full Flow**
   - Request password reset
   - Check console logs for reset link
   - Use link to reset password
   - Verify login works with new password

