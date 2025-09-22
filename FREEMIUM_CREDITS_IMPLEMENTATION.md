# Freemium Tier & AI Credits Implementation

## Overview
This document outlines the implementation of the Freemium tier with message allowances and the pay-as-you-go AI Credits system, replacing the previous model where credits were included with subscriptions.

## Key Changes

### 1. New Pricing Structure

#### Freemium Tier (Default for new users)
- **Price**: Free
- **Features**: 10 messages per month
- **AI Providers**: Basic only
- **Reset**: Monthly
- **Upgrade Path**: Can purchase AI Credits or upgrade to Pro

#### Pro Tier ($19/month)
- **Price**: $19/month
- **Features**: Unlimited messages
- **AI Credits**: Not included - purchase separately
- **AI Providers**: All (OpenAI, Anthropic, Gemini, Azure)
- **Additional**: Full codebase context, Git integration, AI code reviews

#### Team Tier ($49/user/month)
- **Price**: $49/user/month (minimum 3 users)
- **Features**: Everything in Pro + team features
- **AI Credits**: Not included - purchase separately (can be pooled)
- **Additional**: Shared workspaces, team personas, priority support

#### Enterprise Tier
- **Price**: Custom
- **Features**: Everything in Team + enterprise features
- **AI Credits**: Custom arrangements
- **Additional**: SSO, audit logs, data residency, dedicated support

### 2. AI Credits System

#### Credit Packages (One-time purchase)
- 100 Credits: $1.99 (2¢ per credit)
- 500 Credits: $8.99 (1.8¢ per credit)
- 1,000 Credits: $15.99 (1.6¢ per credit)
- 5,000 Credits: $69.99 (1.4¢ per credit)

#### Credit Usage
- Basic operations: 1 credit per message
- Advanced models (GPT-4, Claude-3): 3x multiplier
- Codebase analysis: 10 credits
- App generation: 50 credits
- AI code reviews: 5 credits

### 3. Components Created

#### AICreditsQuickPurchase Component
**File**: `client/src/components/AICreditsQuickPurchase.tsx`

Minimalist dropdown component for purchasing credits during active sessions:
- Shows current balance with color coding
- Displays freemium message allowance if applicable
- Quick purchase options with popular package highlighted
- Integrates seamlessly with existing UI patterns
- Compact mode for header/sidebar placement

#### Updated Landing Page
**File**: `client/src/App.tsx`

- Clear display of Freemium tier with 10 free messages
- Pro and Team tiers shown without included credits
- Pay-as-you-go credits prominently displayed
- "Start Free" call-to-action button

### 4. Database Schema Updates

#### New Fields Added
```sql
-- Users table
messages_used_this_month INTEGER DEFAULT 0
messages_reset_at TIMESTAMP

-- Subscription features table
monthly_message_allowance INTEGER DEFAULT 0
```

#### Updated Feature Configurations
- Freemium: 10 message allowance, no credits
- Pro/Team/Enterprise: Unlimited messages, no included credits
- All tiers can purchase credits separately

### 5. Middleware Enhancements

#### checkFreemiumLimit()
New middleware function that:
- Tracks message usage for freemium users
- Blocks access when limit is reached
- Prompts for upgrade or credit purchase
- Auto-increments message counter

#### Updated Credit Checking
- Separates message allowance from credit balance
- Checks both limits based on tier
- Provides clear upgrade paths

### 6. User Experience Flow

#### New User Journey
1. Sign up → Freemium tier (no payment required)
2. Use 10 free messages to try the service
3. When limit reached, prompted to:
   - Purchase AI Credits (pay-as-you-go)
   - Upgrade to Pro ($19/month)
   - Wait for monthly reset

#### Existing User Migration
- Grandfathered users maintain their benefits
- Current subscriptions continue as-is
- New pricing applies to new signups only

### 7. Integration Points

#### Header Integration
```tsx
import { AICreditsQuickPurchase } from './components/AICreditsQuickPurchase';

// In header component
<AICreditsQuickPurchase isCompact={true} />
```

#### Chat Integration
```tsx
// In chat endpoint
app.post('/api/chat', 
  requireAuth,
  checkFreemiumLimit(), // Check message allowance
  requireCredits(1, 'chat'), // Check credit balance
  async (req, res) => {
    // Process chat message
  }
);
```

### 8. Stripe Products Required

#### Subscription Products
- Freemium: No Stripe product (free tier)
- Pro: $19/month subscription
- Team: $49/user/month subscription
- Enterprise: Custom invoicing

#### Credit Products (One-time)
```
prod_ai_credits
├── price_credits_100 ($1.99)
├── price_credits_500 ($8.99)
├── price_credits_1000 ($15.99)
└── price_credits_5000 ($69.99)
```

### 9. Environment Variables

```env
# Credit package price IDs
STRIPE_CREDITS_100_PRICE_ID=price_xxx
STRIPE_CREDITS_500_PRICE_ID=price_xxx
STRIPE_CREDITS_1000_PRICE_ID=price_xxx
STRIPE_CREDITS_5000_PRICE_ID=price_xxx
```

### 10. Testing Checklist

- [ ] New user signup gets Freemium tier
- [ ] 10 message counter works correctly
- [ ] Message limit blocks access appropriately
- [ ] Credit purchase flow works
- [ ] Credits deduct correctly per operation
- [ ] Monthly reset for freemium messages
- [ ] Upgrade from Freemium to Pro works
- [ ] Team credit pooling functions
- [ ] Grandfathered users unaffected

### 11. Analytics to Track

- Freemium → Pro conversion rate
- Average credits purchased per user
- Message usage patterns for freemium
- Credit consumption by operation type
- Time to first purchase
- Churn at message limit

### 12. Future Enhancements

1. **Credit Bundles**: Discounted packages for bulk purchases
2. **Auto-recharge**: Automatic credit top-ups at threshold
3. **Credit Gifting**: Share credits with team members
4. **Usage Predictions**: ML-based credit usage forecasting
5. **Loyalty Rewards**: Bonus credits for long-term users
6. **Referral Program**: Credits for user referrals

## Migration Steps

1. Run database migration to add new fields
2. Deploy updated middleware with message tracking
3. Update frontend with new components
4. Configure Stripe credit products
5. Test freemium flow end-to-end
6. Monitor conversion metrics

## Support Considerations

### Common Questions
- "Why do I need to buy credits separately?" → Credits are now pay-as-you-go for fair usage
- "What happens when I run out of messages?" → Purchase credits or upgrade to Pro
- "Do credits expire?" → No, purchased credits never expire
- "Can I share credits with my team?" → Yes, with Team/Enterprise plans

### Upgrade Paths
- Freemium → Pro: Unlimited messages, all AI providers
- Freemium → Credits: Continue free tier, pay for usage
- Pro → Team: Add collaboration features
- Team → Enterprise: Custom solutions

## Success Metrics

- **Target Freemium → Paid Conversion**: 15-20%
- **Average Credit Purchase**: $10-15/month
- **Message Limit Hit Rate**: 60-70% of freemium users
- **Credit Attach Rate**: 40% of Pro users
