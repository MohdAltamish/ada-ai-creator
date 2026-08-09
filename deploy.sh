#!/bin/bash
# ============================================
# Autonomous AI Creator — Full Deploy to Vercel
# Run from project root:
#   chmod +x deploy.sh && ./deploy.sh
# ============================================

set -e

echo ""
echo "═══════════════════════════════════════════════"
echo "  🚀 Deploying Autonomous AI Creator to Vercel"
echo "═══════════════════════════════════════════════"
echo ""

# Step 1: Push to GitHub
echo "📦 [1/3] Pushing latest code to GitHub..."
git add -A
git diff --cached --quiet && echo "  (nothing new to commit)" || git commit -m "chore: pre-deploy commit"
git push origin main
echo "  ✅ Code pushed"
echo ""

# Step 2: Set environment variables via Vercel CLI
echo "🔧 [2/3] Setting environment variables..."
# Using vercel env add with --force flag to overwrite existing
for env_pair in \
  "SUPABASE_URL=https://azyhpbwsicbfwuqjkufc.supabase.co" \
  "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6eWhwYndzaWNiZnd1cWprdWZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI3NTE5NSwiZXhwIjoyMTAxODUxMTk1fQ.UNs7riuzLDh23V45wfj3q-b8DeOsx19Oz31en0LpxAo" \
  "NEXT_PUBLIC_SUPABASE_URL=https://azyhpbwsicbfwuqjkufc.supabase.co" \
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_jkIVFV3VbpgJLhKrE0MYZA_Qu3YyXCK" \
  "FEATHERLESS_API_KEY=rc_1a4d83d5c14fec0625e42bbe8ffdfcafb71a7383eb928a6002953129e019fb08" \
  "FEATHERLESS_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731" \
  "FEATHERLESS_CLIENT_ID=app_mfuaETjlur23Z1w0" \
  "FEATHERLESS_CLIENT_SECRET=secret_qJ-DHBxI5BQXJFDl5qmVA5g0CDwzvXOX" \
  "FEATHERLESS_REDIRECT_URI=https://ada-ai-creator.vercel.app/api/auth/featherless/callback" \
  "FEATHERLESS_SCOPES=openid profile" \
  "PUBLISH_INTERVAL_MINUTES=240" \
  "CRON_SECRET=pick-a-random-string"; do
  
  key="${env_pair%%=*}"
  value="${env_pair#*=}"
  
  # Try remove first (ignore errors), then add
  vercel env rm "$key" production --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$key" production 2>/dev/null && \
    echo "  ✅ $key" || echo "  ⚠️  $key (may already exist — check Vercel dashboard)"
done
echo ""

# Step 3: Deploy
echo "🚀 [3/3] Deploying to production..."
vercel --prod --yes
echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  📋 Next steps:"
echo "  1. Visit your Vercel URL shown above"
echo "  2. Click 'Generate Instant Post Now' to create your first post"
echo "  3. Or call: POST <your-url>/api/agent/init"
echo ""
