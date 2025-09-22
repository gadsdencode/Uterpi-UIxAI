# Multi-Tiered Subscription System Implementation

## Overview
This document outlines the implementation of a comprehensive multi-tiered subscription system with usage-based AI credits, designed to cater to individuals, teams, and enterprises while grandfathering existing users.

## Implementation Summary

### 1. Database Schema Updates
**File:** `migrations/0005_subscription_tiers_credits.sql`
- Added AI credits system with balance tracking and monthly resets
- Created teams table for Team/Enterprise plan management
- Implemented AI credits transactions table for usage tracking
- Added subscription features table for tier-based feature flags
- Included grandfathering fields to preserve existing user benefits

### 2. Grandfathering Migration
**File:** `server/grandfather-users-migration.ts`
- Automatically migrates existing users to appropriate new tiers:
  - Free users → Free tier (100 credits/month)
  - NomadAI Pro ($5) users → Pro tier with grandfathered pricing
  - Friends & Family → Pro tier with special status
  - Enterprise → New Enterprise tier
- Preserves original pricing for grandfathered users
- Creates audit trail of migration

### 3. Enhanced Stripe Integration
**File:** `server/stripe-enhanced.ts`
- Multi-tier subscription management with per-seat billing for teams
- Usage-based billing for AI credits
- One-time credit package purchases
- Team subscription management (add/remove seats)
- Credit consumption tracking with operation-based pricing

### 4. Subscription Middleware
**File:** `server/subscription-middleware-enhanced.ts`
- Feature flag checking based on subscription tier
- AI credits validation before operations
- Team role-based permissions
- Tier-based rate limiting
- Enhanced subscription status checking

### 5. API Endpoints
**File:** `server/subscription-routes.ts`
- `/api/subscription/details` - Get current subscription with features
- `/api/subscription/plans` - List available plans
- `/api/credits/balance` - Check AI credits balance
- `/api/credits/purchase` - Buy additional credits
- `/api/team/*` - Team management endpoints
- `/api/usage/analytics` - Usage analytics and insights

### 6. Frontend Components
**Files:** 
- `client/src/components/PricingPage.tsx` - Comprehensive pricing page with tier comparison
- `client/src/components/AICreditsDisplay.tsx` - Credits balance and usage display

## Subscription Tiers

### Free Plan
- **Price:** $0/month
- **AI Credits:** 100/month
- **Features:** Basic chat, 1 project, community support
- **Target:** Hobbyists and trial users

### Pro Plan
- **Price:** $19/month ($190/year)
- **AI Credits:** 1,000/month
- **Features:** Unlimited chat, all AI providers, 1 project with full context, Git integration, 10 AI code reviews/month
- **Target:** Individual developers and freelancers

### Team Plan
- **Price:** $49/user/month (min 3 users)
- **AI Credits:** 5,000/user/month (pooled)
- **Features:** Everything in Pro + 10 projects/user, shared workspaces, team personas, 100 AI code reviews/user
- **Target:** Startups and small teams

### Enterprise Plan
- **Price:** Custom
- **AI Credits:** Custom/Unlimited
- **Features:** Everything in Team + SSO, audit logs, data residency, dedicated support
- **Target:** Large organizations

## AI Credits System

### Credit Costs by Operation
- Basic chat: 1 credit
- Codebase analysis: 10 credits
- App generation: 50 credits
- AI code review: 5 credits
- Premium models (GPT-4, Claude-3): 3x multiplier

### Credit Management
- Monthly reset on the 1st of each month
- Credits can be purchased in packages (100, 500, 1000, 5000)
- Team plans use pooled credits
- Purchased credits never expire

## Migration Steps

1. **Run Database Migration**
   ```bash
   npx drizzle-kit push:pg
   # or
   psql -d your_database -f migrations/0005_subscription_tiers_credits.sql
   ```

2. **Update Environment Variables**
   ```env
   # Stripe Product IDs
   STRIPE_PRO_PRODUCT_ID=prod_xxx
   STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
   STRIPE_TEAM_PRODUCT_ID=prod_xxx
   STRIPE_TEAM_MONTHLY_PRICE_ID=price_xxx
   STRIPE_ENTERPRISE_PRODUCT_ID=prod_xxx
   
   # Admin emails for migration
   ADMIN_EMAILS=admin@example.com,admin2@example.com
   ```

3. **Run Grandfather Migration**
   ```bash
   npm run migrate:grandfather
   # or manually via API
   POST /api/admin/grandfather-migration
   ```

4. **Update Server Routes**
   ```typescript
   // In server/index.ts or server/routes.ts
   import subscriptionRoutes from './subscription-routes';
   app.use('/api', subscriptionRoutes);
   ```

5. **Update Frontend Routes**
   ```tsx
   // Add to your router configuration
   <Route path="/pricing" element={<PricingPage />} />
   <Route path="/settings/credits" element={<AICreditsDisplay />} />
   ```

## Testing Checklist

- [ ] Verify existing users are grandfathered correctly
- [ ] Test credit consumption for different operations
- [ ] Verify monthly credit reset functionality
- [ ] Test team creation and member management
- [ ] Validate feature flags for each tier
- [ ] Test credit purchase flow
- [ ] Verify rate limiting per tier
- [ ] Test subscription upgrade/downgrade flows
- [ ] Validate team pooled credits
- [ ] Test enterprise feature access

## Monitoring & Analytics

### Key Metrics to Track
- Credit usage by operation type
- Conversion rates between tiers
- Credit purchase frequency
- Team size distribution
- Feature adoption by tier
- Churn rate by subscription tier

### Recommended Dashboards
1. **Revenue Dashboard**
   - MRR by tier
   - Credit purchase revenue
   - Grandfathered vs new pricing

2. **Usage Dashboard**
   - Credits consumed per user/team
   - Most used operations
   - Peak usage times

3. **Customer Success Dashboard**
   - Feature adoption rates
   - Support tickets by tier
   - User engagement scores

## Support Considerations

### Grandfathered Users
- Maintain special pricing indefinitely
- Provide clear communication about their benefits
- Option to upgrade to new tiers if desired

### Team Management
- Clear onboarding for team admins
- Self-service seat management
- Automated billing for seat changes

### Credit Management
- Clear usage tracking and notifications
- Low balance alerts
- Usage optimization tips

## Future Enhancements

1. **Credit Rollover** - Allow unused credits to roll over (premium feature)
2. **Custom Models** - Enterprise customers can use their own AI models
3. **Usage Forecasting** - Predict credit needs based on historical usage
4. **Team Analytics** - Detailed usage reports for team admins
5. **Bulk Discounts** - Volume discounts for large credit purchases
6. **API Access Tiers** - Different API rate limits and features by tier

## Security Considerations

- All credit transactions are logged for audit
- Team permissions are enforced at middleware level
- Grandfathered status is immutable once set
- SSO implementation for enterprise customers
- Data residency options for compliance

## Rollback Plan

If issues arise, the system can be rolled back by:
1. Restoring the database backup
2. Reverting to previous code version
3. Re-running the original subscription setup
4. Grandfathered users retain their benefits in any scenario

## Contact

For questions or issues with the implementation:
- Technical: dev-team@nomadai.com
- Billing: billing@nomadai.com
- Enterprise: sales@nomadai.com
