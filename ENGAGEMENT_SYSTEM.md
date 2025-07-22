# 🚀 NomadAI Engagement System

A comprehensive, customer-experience focused engagement system that leverages Resend to create personalized email nudges and track user interactions with NomadAI.

## 🎯 Overview

The engagement system transforms user interaction data into meaningful insights and automated email campaigns that nurture users through their AI journey. It's designed to be:

- **Customer-Centric**: Respects user preferences and provides value
- **Data-Driven**: Uses behavioral analytics to trigger relevant emails
- **Scalable**: Handles growing user base with automated campaigns
- **Privacy-Focused**: Easy opt-out and granular email controls

## ✨ Features Implemented

### 🔍 User Engagement Tracking
- **Activity Monitoring**: Login, session, file uploads, chat interactions
- **Engagement Scoring**: 0-100 score based on usage patterns
- **User Segmentation**: Automatic categorization (new, active, at_risk, dormant)
- **Real-time Analytics**: Track user behavior patterns

### 📧 Email Campaign System
- **Welcome Series**: Onboarding new users with feature introductions
- **Re-engagement**: Win back inactive users with personalized stats
- **Feature Discovery**: Highlight unused features based on behavior
- **Usage Insights**: Weekly/monthly productivity reports
- **Product Tips**: AI productivity tips tailored to user behavior
- **Community Highlights**: Success stories and user showcases

### ⚙️ Email Preference Management
- **Granular Controls**: Individual email type preferences
- **Frequency Settings**: Daily, weekly, or monthly emails
- **Master Unsubscribe**: One-click unsubscribe from all emails
- **Test Functionality**: Send test emails to preview content

### 📊 Analytics & Tracking
- **Email Opens**: Tracking pixel integration
- **Link Clicks**: Click tracking with redirect functionality
- **Delivery Metrics**: Success rates and bounce handling
- **User Journey**: Complete activity timeline

## 🏗️ Technical Architecture

### Database Schema

```sql
-- User engagement tracking
user_engagement:
  - userId, totalLogins, totalSessions, totalTimeSpent
  - filesUploaded, filesAnalyzed, chatMessagesCount
  - engagementScore, userSegment, timezone
  - firstSessionAt, lastActivityAt

-- Email preferences
email_preferences:
  - userId, welcomeEmails, reengagementEmails
  - featureUpdates, productTips, usageInsights
  - emailFrequency, isUnsubscribed, unsubscribeToken

-- Email campaign management
email_campaigns:
  - name, campaignType, emailTemplate
  - targetSegment, scheduledAt, triggerEvent
  - totalSent, totalOpened, totalClicked

-- Email send log
email_send_log:
  - userId, emailType, emailSubject, status
  - sentAt, openedAt, clickedAt
  - openTrackingToken, clickTrackingToken

-- User activity
user_activity:
  - userId, activityType, activityData
  - sessionId, userAgent, ipAddress, duration
```

### API Endpoints

```typescript
// Engagement tracking
POST /api/engagement/track
GET  /api/engagement/stats

// Email preferences
GET  /api/engagement/email-preferences
PUT  /api/engagement/email-preferences

// Unsubscribe management
POST /api/engagement/unsubscribe

// Email tracking
GET  /api/engagement/track-open
GET  /api/engagement/track-click

// Manual email triggers
POST /api/engagement/send-email
```

### Frontend Components

- **EmailPreferences**: Complete email management interface
- **EngagementStats**: User activity dashboard
- **UnsubscribePage**: Graceful unsubscribe experience

## 📧 Email Templates

### 🎉 Welcome Email
**Triggered**: 2 hours after registration
**Purpose**: Introduce key features and encourage first interactions

**Content**:
- Personal greeting with user name
- Feature cards for chat and file analysis
- Pro tips for AI success
- Clear call-to-action buttons

### 🔄 Re-engagement Email
**Triggered**: 7+ days of inactivity
**Purpose**: Win back dormant users with personal progress

**Content**:
- Days since last visit
- Personal usage statistics
- What's new since they've been away
- Encouraging comeback message

### 🔍 Feature Discovery Email
**Triggered**: Users who haven't used key features
**Purpose**: Highlight unused capabilities

**Content**:
- Personalized list of unused features
- Benefits of each feature
- Step-by-step guides
- "Take the tour" call-to-action

### 📊 Usage Insights Email
**Triggered**: Weekly/monthly based on preferences
**Purpose**: Show productivity progress and achievements

**Content**:
- Session and message statistics
- Time spent and files analyzed
- Achievement badges
- Most productive days
- Motivation to continue

### 💡 Product Tips Email
**Triggered**: Weekly based on user behavior
**Purpose**: Improve AI productivity with expert techniques

**Content**:
- 3 tailored tips based on usage patterns
- Before/after examples
- Expert quotes
- "Apply these tips" call-to-action

## 🔧 Configuration

### Environment Variables

```env
# Resend Configuration (from password reset setup)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
FROM_EMAIL="noreply@nomadai.app"
FRONTEND_URL="https://nomadai.app"
```

### Email Frequency Settings

- **Daily**: High-value tips and urgent notifications
- **Weekly**: Usage insights, feature discovery, re-engagement
- **Monthly**: Community highlights, major updates

### User Segmentation Logic

```typescript
// Engagement score calculation (0-100)
const score = 
  Math.min(25, loginFrequency * 5) +           // Login frequency
  Math.min(25, featureUsage) +                 // Feature usage
  Math.min(25, recencyScore) +                 // Recent activity
  Math.min(25, avgTimePerSession / 2);         // Time investment

// Segmentation rules
if (daysSinceFirst > 30) {
  segment = score >= 70 ? 'active' : score >= 40 ? 'at_risk' : 'dormant';
} else if (daysSinceFirst > 7) {
  segment = score >= 50 ? 'active' : 'at_risk';
} else {
  segment = 'new';
}
```

## 🎨 Email Design Principles

### Visual Consistency
- **Brand Colors**: Purple gradient (#667eea to #764ba2)
- **Typography**: Modern, readable fonts with clear hierarchy
- **Responsive**: Mobile-first design for all devices
- **Accessibility**: High contrast and screen reader friendly

### Content Strategy
- **Personalization**: Use first name and specific user data
- **Value-First**: Every email provides clear user benefit
- **Action-Oriented**: Clear, compelling call-to-action buttons
- **Scannable**: Easy to read with bullet points and cards

### Customer Experience
- **Frequency Control**: Respect user preferences
- **Easy Unsubscribe**: One-click process with feedback option
- **Relevant Timing**: Send when users are most likely to engage
- **No Spam**: Only send valuable, requested content

## 📈 Analytics & Metrics

### Email Performance Metrics
- **Open Rates**: Tracking pixel implementation
- **Click-Through Rates**: Link tracking with UTM parameters
- **Unsubscribe Rates**: Monitor content satisfaction
- **Conversion Rates**: Track email-to-action completion

### User Engagement Metrics
- **Engagement Score**: Overall user activity health
- **Feature Adoption**: Track unused feature discovery
- **Session Quality**: Time spent and interaction depth
- **Retention Rates**: Impact of email campaigns on user return

### Campaign Effectiveness
- **Welcome Series**: First-week activation rates
- **Re-engagement**: Dormant user reactivation
- **Feature Discovery**: Feature adoption post-email
- **Usage Insights**: User motivation and continued usage

## 🚀 Automated Campaign Schedule

### Daily Campaigns
```typescript
// 2 AM UTC - Process welcome emails (2 hours after registration)
await sendWelcomeEmailsToNewUsers();

// 10 AM UTC - Send re-engagement emails (7+ days inactive)
await sendReengagementEmails();

// 2 PM UTC - Feature discovery for users missing key features
await sendFeatureDiscoveryEmails();
```

### Weekly Campaigns
```typescript
// Monday 9 AM UTC - Weekly usage insights
await sendWeeklyUsageInsights();

// Wednesday 1 PM UTC - Product tips based on behavior
await sendWeeklyProductTips();
```

### Monthly Campaigns
```typescript
// First Monday 10 AM UTC - Community highlights
await sendCommunityHighlights();

// Third Tuesday 2 PM UTC - Feature updates and roadmap
await sendFeatureUpdates();
```

## 🛠️ Usage Examples

### Track User Activity
```typescript
// Track login
await engagementService.trackActivity(userId, 'login');

// Track file upload
await engagementService.trackActivity(userId, 'file_upload', { 
  filename: 'document.pdf',
  size: 1024000 
});

// Track chat message
await engagementService.trackActivity(userId, 'chat_message', {
  messageLength: 150,
  model: 'gpt-4'
});
```

### Send Manual Email
```typescript
// Send welcome email
await engagementService.sendWelcomeEmail(userId);

// Send usage insights
await engagementService.sendUsageInsightsEmail(userId, 'week');

// Send product tips
await engagementService.sendProductTipsEmail(userId, 'productivity');
```

### Update Email Preferences
```typescript
await engagementService.updateEmailPreferences(userId, {
  emailFrequency: 'weekly',
  productTips: true,
  usageInsights: false
});
```

## 🔒 Privacy & Compliance

### GDPR Compliance
- **Consent Management**: Explicit opt-in for email types
- **Data Access**: Users can view all stored engagement data
- **Right to Delete**: Complete data removal on request
- **Transparency**: Clear privacy policy and data usage

### Anti-Spam Measures
- **Double Opt-in**: Confirm email preferences on registration
- **Easy Unsubscribe**: One-click unsubscribe in every email
- **Frequency Limits**: Respect user-defined email frequency
- **Content Quality**: Only valuable, relevant content

### Security Features
- **Token-based Unsubscribe**: Secure, unique tokens
- **Email Verification**: Prevent abuse with verified domains
- **Activity Encryption**: Sensitive data encrypted at rest
- **Access Controls**: Role-based access to engagement data

## 🎯 Success Metrics

### User Engagement Goals
- **30% increase** in weekly active users
- **50% reduction** in user churn rate
- **25% increase** in feature adoption
- **40% improvement** in user onboarding completion

### Email Campaign Goals
- **>25% open rates** across all campaign types
- **>5% click-through rates** for action-oriented emails
- **<2% unsubscribe rates** maintaining user satisfaction
- **>15% conversion rates** from email to product usage

### Customer Experience Goals
- **>4.5/5 user satisfaction** with email content
- **<24 hours** email delivery for time-sensitive content
- **>90% deliverability** rate across all email providers
- **<0.1% spam complaints** maintaining sender reputation

## 🔮 Future Enhancements

### Advanced Personalization
- **ML-powered Send Times**: Optimal delivery based on user behavior
- **Dynamic Content**: Real-time personalization based on recent activity
- **A/B Testing**: Automated testing of subject lines and content
- **Predictive Analytics**: Forecast user churn and intervention needs

### Multi-Channel Engagement
- **In-App Notifications**: Complement email with product notifications
- **SMS Integration**: Critical alerts and high-value tips
- **Push Notifications**: Mobile app engagement
- **Social Media**: Community building and user showcases

### Advanced Analytics
- **Cohort Analysis**: Track user groups over time
- **Attribution Modeling**: Email impact on product metrics
- **Lifetime Value**: Email campaign ROI analysis
- **Behavioral Segmentation**: Advanced user clustering

---

## 🎉 Getting Started

1. **Set up Resend**: Configure API key and sender domain
2. **Run Migration**: Apply database schema changes
3. **Configure Environment**: Set required environment variables
4. **Test Emails**: Send test campaigns to verify setup
5. **Monitor Analytics**: Track performance and optimize

The engagement system is now ready to create meaningful, customer-centric email experiences that drive user success with NomadAI! 🚀 