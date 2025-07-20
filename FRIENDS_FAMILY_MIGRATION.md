# Friends & Family Subscription Migration

## Overview

This migration implements a special "Friends & Family" subscription tier for all existing users in the database. This allows current users to continue testing the application with full access to all premium AI features while Stripe integration is fully implemented.

## What This Migration Does

### 1. Creates Friends & Family Plan
- **Name**: "Friends & Family"
- **Price**: $0.00 (Free)
- **Duration**: Monthly (but set to expire 1 year from migration)
- **Access Level**: Premium (equivalent to paid plans)
- **Features**:
  - Unlimited AI interactions
  - Advanced code analysis
  - UI generation & cloning
  - Performance insights
  - Design pattern analysis
  - All AI models available
  - Code improvement suggestions
  - Advanced debugging assistance
  - Friends & Family special access

### 2. Migrates ONLY Free Tier Users (Preserves Paid Users)
- **ONLY** targets users with `subscriptionTier` = "free" 
- **PRESERVES** all existing paid subscriptions (no changes to paid users)
- Updates free users' `subscriptionStatus` to "active"
- Sets free users' `subscriptionTier` to "friends_family"
- Sets `subscriptionEndsAt` to 1 year from migration date
- Creates subscription records only for users without existing active subscriptions
- **SAFETY CHECKS**: Double-validates user tier before any updates

### 3. Updates Access Control
- Modified `subscription-middleware.ts` to recognize "friends_family" as premium tier
- Updated client-side `useSubscription.ts` hook for consistent tier hierarchy
- Friends & Family users get the same access as premium subscribers

## Safety Features

### Zero-Deletion Policy & Data Preservation
- ✅ **ABSOLUTELY NO** existing data is deleted
- ✅ **ONLY** affects users currently on free tier
- ✅ **PRESERVES** all existing paid subscriptions completely untouched
- ✅ Only adds new Friends & Family subscription plan
- ✅ Only updates free users' subscription fields  
- ✅ **SAFETY CHECKS** prevent overwriting active paid subscriptions
- ✅ Creates new subscription records only when safe
- ✅ Rollback available (reverts only Friends & Family users to free tier)

### Error Handling
- ✅ Comprehensive error logging
- ✅ Individual user error handling (one failure doesn't stop migration)
- ✅ Detailed migration summary report
- ✅ Safe rollback function available

### Validation
- ✅ Checks if plan already exists before creating
- ✅ Validates database connection
- ✅ Handles existing subscription records
- ✅ Provides detailed progress tracking

## Files Created/Modified

### New Files
- `server/friends-family-migration.ts` - Core migration logic
- `server/run-migration.ts` - Migration execution script
- `FRIENDS_FAMILY_MIGRATION.md` - This documentation

### Modified Files
- `server/subscription-middleware.ts` - Added friends_family tier to hierarchy
- `client/src/hooks/useSubscription.ts` - Added friends_family tier to client hierarchy

## Running the Migration

### Prerequisites
1. Ensure database is up-to-date: `npx drizzle-kit push`
2. Have valid `DATABASE_URL` in environment variables
3. Backup database (recommended for production)

### Execute Migration
```bash
# Run the migration
npx ts-node server/run-migration.ts

# Or run directly with the migration script
npx ts-node server/friends-family-migration.ts
```

### Rollback (if needed)
```bash
# Rollback users to free tier (keeps the plan)
npx ts-node server/friends-family-migration.ts rollback
```

## Expected Results

### Success Indicators
- ✅ Friends & Family plan created (or already exists)
- ✅ All existing users updated to "active" status
- ✅ All users assigned "friends_family" tier
- ✅ Subscription records created/updated
- ✅ 1-year expiration set for all users

### Verification Steps
1. Check database:
   ```sql
   SELECT name, price FROM subscription_plans WHERE name = 'Friends & Family';
   SELECT COUNT(*) FROM users WHERE subscription_tier = 'friends_family';
   SELECT COUNT(*) FROM subscriptions WHERE plan_id = (SELECT id FROM subscription_plans WHERE name = 'Friends & Family');
   ```

2. Test user access:
   - Login as any existing user
   - Access premium AI features (analyze, improve, create-page)
   - Verify no subscription prompts appear

3. Check subscription status API:
   ```bash
   curl -X GET http://localhost:5000/api/subscription/status \
        -H "Cookie: your-session-cookie"
   ```

## Benefits

### For Users
- ✅ Immediate access to all premium features
- ✅ No interruption in testing experience
- ✅ No payment required for testing phase
- ✅ 1-year generous expiration period

### For Development
- ✅ Allows thorough testing of subscription system
- ✅ Validates all premium feature access controls
- ✅ Tests subscription middleware with real data
- ✅ Provides realistic subscription usage patterns

### For Business
- ✅ Maintains user engagement during development
- ✅ Allows comprehensive feature testing
- ✅ Provides time to complete Stripe integration
- ✅ Enables user feedback on premium features

## Monitoring & Maintenance

### What to Monitor
- User subscription statuses in database
- Premium feature access logs
- Subscription expiration dates
- Any access control errors

### Future Actions
1. **Before Launch**: Transition users to proper paid plans
2. **Expiration Management**: Set up alerts for approaching expiration dates
3. **Access Control**: Monitor for any bypass attempts
4. **User Communication**: Notify users before expiration

## Technical Notes

### Tier Hierarchy
```typescript
const tierHierarchy = {
  free: 0,
  basic: 1,
  premium: 2,
  friends_family: 2  // Same access level as premium
};
```

### Database Schema Impact
- New row in `subscription_plans` table
- Updates to `users.subscription_tier` and `users.subscription_status`
- New/updated rows in `subscriptions` table
- No schema changes required

### Stripe Integration
- Plan uses placeholder Stripe IDs (no actual Stripe integration needed)
- Price set to $0.00 (free plan)
- Can be integrated with Stripe later if desired

## Troubleshooting

### Common Issues
1. **Database Connection**: Ensure `DATABASE_URL` is correct
2. **Missing Plan**: Check if plan creation succeeded
3. **User Update Failures**: Review individual user error messages
4. **Access Issues**: Verify tier hierarchy updates

### Debug Commands
```bash
# Check migration status
npx ts-node -e "
import { db } from './server/db';
import { users, subscriptionPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function check() {
  const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, 'Friends & Family'));
  const ffUsers = await db.select().from(users).where(eq(users.subscriptionTier, 'friends_family'));
  console.log('Plan:', plan[0]?.name);
  console.log('Users with Friends & Family:', ffUsers.length);
}
check();
"
```

## Security Considerations

- ✅ Migration requires database access (server-side only)
- ✅ No client-side changes needed for migration
- ✅ All access control remains server-enforced
- ✅ Friends & Family tier properly validated in middleware
- ✅ No bypass mechanisms introduced

---

*Migration created with safety and accuracy as top priorities. All changes are reversible and follow the zero-deletion policy.* 