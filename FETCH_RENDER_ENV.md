# Fetch Environment Variables from Render

## Quick Method

I've created a script to fetch all environment variables from Render and populate your `.env` file.

### Step 1: Get Your Render API Key

1. Go to https://dashboard.render.com/account/api-keys
2. Click "Create API Key"
3. Copy the API key
4. Export it in your terminal:
   ```bash
   export RENDER_API_KEY=your-api-key-here
   ```

### Step 2: Run the Script

```bash
./fetch-render-env.sh
```

The script will:
1. List your Render services
2. Ask you to select your backend service
3. Fetch all environment variables
4. Save them to `.env` file

### Alternative: Manual Method

If you prefer to do it manually or the script doesn't work:

#### Option A: Using Render Dashboard

1. Go to https://dashboard.render.com
2. Click on your backend service
3. Click "Environment" tab
4. Copy each variable manually to your `.env` file

#### Option B: Using Render API with curl

```bash
# Set your API key
export RENDER_API_KEY=your-api-key

# Set your service ID (find it in Render dashboard URL or service settings)
export SERVICE_ID=srv-xxxxx

# Fetch and save to .env
curl -s --request GET \
     --url "https://api.render.com/v1/services/$SERVICE_ID/env-vars" \
     --header "accept: application/json" \
     --header "authorization: Bearer $RENDER_API_KEY" \
     | jq -r '.[] | "\(.key)=\(.value)"' > .env
```

**Note:** Requires `jq` to be installed: `brew install jq`

---

## After Fetching

1. **Review the .env file:**
   ```bash
   cat .env
   ```

2. **Verify Supabase variables are present:**
   ```bash
   grep SUPABASE .env
   ```

3. **Restart your server:**
   ```bash
   npm start
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

---

## Security Reminder

- ✅ `.env` is already in `.gitignore`
- ⚠️ Never commit `.env` to git
- ⚠️ Don't share your `.env` file
- ⚠️ The file contains sensitive credentials

