import { Resend } from 'resend';

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email - should be configured in environment or use a verified domain
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@overture-systems.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';

export interface PasswordResetEmailOptions {
  to: string;
  name?: string;
  resetToken: string;
  resetUrl?: string;
}

/**
 * Send password reset email using Resend
 */
export async function sendPasswordResetEmail({
  to,
  name = '',
  resetToken,
  resetUrl
}: PasswordResetEmailOptions): Promise<void> {
  try {
    // If no custom reset URL provided, use default pattern
    const finalResetUrl = resetUrl || `${process.env.FRONTEND_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
    
    const displayName = name ? ` ${name}` : '';
    
    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: 'Reset Your Password - Uterpi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello${displayName}!</h2>
              <p>We received a request to reset your password for your Uterpi account. If you made this request, click the button below to reset your password:</p>
              
              <div style="text-align: center;">
                <a href="${finalResetUrl}" class="button">Reset My Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px;">
                ${finalResetUrl}
              </p>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This link will expire in 1 hour for security reasons</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this link with anyone</li>
                </ul>
              </div>
              
              <p>If you continue to have problems, please contact our support team.</p>
              
              <p>Best regards,<br>The Uterpi Team</p>
            </div>
            <div class="footer">
              <p>© 2025 Uterpi. All rights reserved.</p>
              <p>This email was sent to ${to}. If you didn't request this, you can safely ignore it.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello${displayName}!

We received a request to reset your password for your Uterpi account.

To reset your password, visit this link:
${finalResetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email.

Best regards,
The Uterpi Team

---
© 2025 Uterpi. All rights reserved.
This email was sent to ${to}. If you didn't request this, you can safely ignore it.
      `
    };

    // Send email using Resend
    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending password reset email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
    
    console.log('Password reset email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendPasswordResetEmail:', error);
    throw error;
  }
}

/**
 * Send password reset confirmation email
 */
export async function sendPasswordResetConfirmationEmail(to: string, name?: string): Promise<void> {
  try {
    const displayName = name ? ` ${name}` : '';
    
    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: 'Password Successfully Reset - Uterpi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Confirmation</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
            .success { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Password Reset Successful</h1>
            </div>
            <div class="content">
              <h2>Hello${displayName}!</h2>
              
              <div class="success">
                <strong>Your password has been successfully reset!</strong>
              </div>
              
              <p>This email confirms that your Uterpi account password was changed successfully. You can now log in with your new password.</p>
              
              <p>If you didn't make this change, please contact our support team immediately as your account may be compromised.</p>
              
              <p>For security reasons, we recommend:</p>
              <ul>
                <li>Using a strong, unique password</li>
                <li>Enabling two-factor authentication if available</li>
                <li>Not sharing your password with anyone</li>
              </ul>
              
              <p>Best regards,<br>The Uterpi Team</p>
            </div>
            <div class="footer">
              <p>© 2025 Uterpi. All rights reserved.</p>
              <p>This email was sent to ${to}.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello${displayName}!

Your password has been successfully reset!

This email confirms that your Uterpi account password was changed successfully. You can now log in with your new password.

If you didn't make this change, please contact our support team immediately.

Best regards,
The Uterpi Team

---
© 2025 Uterpi. All rights reserved.
This email was sent to ${to}.
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending password reset confirmation email:', error);
      throw new Error(`Failed to send confirmation email: ${error.message}`);
    }
    
    console.log('Password reset confirmation email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendPasswordResetConfirmationEmail:', error);
    throw error;
  }
}

// =============================================================================
// ENGAGEMENT EMAIL SYSTEM
// =============================================================================

export interface EngagementEmailOptions {
  to: string;
  name?: string;
  unsubscribeToken?: string;
  trackingPixel?: string;
  personalData?: Record<string, any>;
}

/**
 * Generate common email footer with unsubscribe and tracking
 */
function generateEmailFooter(unsubscribeToken?: string, trackingPixel?: string): string {
  const unsubscribeLink = unsubscribeToken 
    ? `${FRONTEND_URL}/unsubscribe?token=${unsubscribeToken}`
    : '#';
    
  const trackingPixelHtml = trackingPixel 
    ? `<img src="${FRONTEND_URL}/api/engagement/track-open?token=${trackingPixel}" width="1" height="1" style="display:none;" alt="">`
    : '';

  return `
    <div class="footer" style="background-color: #f8f9fa; padding: 30px 20px; text-align: center; color: #6c757d; font-size: 14px; border-top: 1px solid #e9ecef;">
      <div style="max-width: 600px; margin: 0 auto;">
        <p style="margin: 0 0 15px 0;">© 2025 Uterpi. All rights reserved.</p>
        <p style="margin: 0 0 15px 0;">
          <a href="${FRONTEND_URL}" style="color: #667eea; text-decoration: none;">Visit Uterpi</a> | 
          <a href="${FRONTEND_URL}/help" style="color: #667eea; text-decoration: none;">Help Center</a> | 
          <a href="${FRONTEND_URL}/privacy" style="color: #667eea; text-decoration: none;">Privacy Policy</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          Don't want to receive these emails? 
          <a href="${unsubscribeLink}" style="color: #667eea; text-decoration: none;">Unsubscribe here</a>
        </p>
      </div>
      ${trackingPixelHtml}
    </div>
  `;
}

/**
 * Welcome Email Series - Day 1: Getting Started
 */
export async function sendWelcomeEmail(options: EngagementEmailOptions): Promise<void> {
  try {
    const { to, name = '', unsubscribeToken, trackingPixel } = options;
    const displayName = name ? ` ${name}` : '';

    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: `Welcome to Uterpi${displayName}! Let's get you started 🚀`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Uterpi</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 15px 0; }
            .feature-card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; }
            .tips { background: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Uterpi${displayName}!</h1>
              <p style="margin: 0; opacity: 0.9;">Your AI-powered productivity companion is ready</p>
            </div>
            <div class="content">
              <h2>Ready to supercharge your productivity?</h2>
              <p>Thank you for joining Uterpi! We're excited to help you unlock the power of AI for your daily tasks. Here's how to get started:</p>
              
              <div class="feature-card">
                <h3>🤖 Start Your First Chat</h3>
                <p>Jump right in with our AI assistant. Ask questions, get help with tasks, or brainstorm ideas.</p>
                <a href="${FRONTEND_URL}/?utm_source=email&utm_campaign=welcome&utm_content=chat_cta" class="button">Start Chatting</a>
              </div>
              
              <div class="feature-card">
                <h3>📁 Upload & Analyze Files</h3>
                <p>Upload documents, images, or data files and let our AI analyze them for insights.</p>
                <a href="${FRONTEND_URL}/files?utm_source=email&utm_campaign=welcome&utm_content=files_cta" class="button">Try File Analysis</a>
              </div>
              
              <div class="tips">
                <h3>💡 Pro Tips for Success</h3>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Be specific in your questions for better AI responses</li>
                  <li>Use the file upload feature for document analysis</li>
                  <li>Explore different AI models for various tasks</li>
                  <li>Save important conversations for future reference</li>
                </ul>
              </div>
              
              <p>Need help getting started? Our <a href="${FRONTEND_URL}/help?utm_source=email&utm_campaign=welcome" style="color: #667eea;">help center</a> has guides and tutorials.</p>
              
              <p>Best regards,<br>The Uterpi Team</p>
            </div>
            ${generateEmailFooter(unsubscribeToken, trackingPixel)}
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to Uterpi${displayName}!

Thank you for joining Uterpi! We're excited to help you unlock the power of Uterpi for your daily tasks.

Get started with these features:
- Start your first chat with our AI assistant
- Upload and analyze files for insights
- Explore different AI models for various tasks

Visit Uterpi: ${FRONTEND_URL}

Need help? Check our help center: ${FRONTEND_URL}/help

Best regards,
The Uterpi Team
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending welcome email:', error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
    
    console.log('Welcome email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendWelcomeEmail:', error);
    throw error;
  }
}

/**
 * Re-engagement Email for inactive users
 */
export async function sendReengagementEmail(options: EngagementEmailOptions): Promise<void> {
  try {
    const { to, name = '', unsubscribeToken, trackingPixel, personalData } = options;
    const displayName = name ? ` ${name}` : '';
    const daysSinceLastLogin = personalData?.daysSinceLastLogin || 7;

    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: `We miss you${displayName}! Your Uterpi assistant is waiting ⏰`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Come Back to Uterpi</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 15px 0; }
            .highlight { background: #e8f5e8; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #4caf50; }
            .stats { text-align: center; background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🤖 We miss you${displayName}!</h1>
              <p style="margin: 0; opacity: 0.9;">Your Uterpi assistant has been waiting for you</p>
            </div>
            <div class="content">
              <h2>It's been ${daysSinceLastLogin} days since your last visit</h2>
              <p>We noticed you haven't been around lately, and we wanted to check in! The AI world has been buzzing with activity, and we'd love to have you back.</p>
              
              <div class="highlight">
                <h3>🚀 What's New Since You've Been Away</h3>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Improved AI response accuracy and speed</li>
                  <li>New file analysis capabilities</li>
                  <li>Enhanced chat experience with better memory</li>
                  <li>Community features and user showcases</li>
                </ul>
              </div>
              
              <div class="stats">
                <h3>Your Uterpi Journey</h3>
                <p><strong>${personalData?.totalSessions || 0}</strong> sessions completed</p>
                <p><strong>${personalData?.filesAnalyzed || 0}</strong> files analyzed</p>
                <p><strong>${personalData?.chatMessages || 0}</strong> AI conversations</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${FRONTEND_URL}/?utm_source=email&utm_campaign=reengagement&utm_content=comeback_cta" class="button">Continue Your AI Journey</a>
              </div>
              
              <p>Need a refresher? Check out our <a href="${FRONTEND_URL}/help?utm_source=email&utm_campaign=reengagement" style="color: #667eea;">latest tutorials</a> or start with a simple question.</p>
              
              <p>Looking forward to seeing you again!</p>
              <p>The Uterpi Team</p>
            </div>
            ${generateEmailFooter(unsubscribeToken, trackingPixel)}
          </div>
        </body>
        </html>
      `,
      text: `
We miss you${displayName}!

It's been ${daysSinceLastLogin} days since your last visit to Uterpi. We'd love to have you back!

What's new since you've been away:
- Improved Uterpi response accuracy and speed
- New file upload & analysis capabilities  
- Enhanced chat experience with better memory

Your Uterpi journey so far:
- ${personalData?.totalSessions || 0} sessions completed
- ${personalData?.filesAnalyzed || 0} files analyzed
- ${personalData?.chatMessages || 0} AI conversations

Continue your AI journey: ${FRONTEND_URL}

Looking forward to seeing you again!
The Uterpi Team
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending reengagement email:', error);
      throw new Error(`Failed to send reengagement email: ${error.message}`);
    }
    
    console.log('Reengagement email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendReengagementEmail:', error);
    throw error;
  }
}

/**
 * Feature Discovery Email
 */
export async function sendFeatureDiscoveryEmail(options: EngagementEmailOptions): Promise<void> {
  try {
    const { to, name = '', unsubscribeToken, trackingPixel, personalData } = options;
    const displayName = name ? ` ${name}` : '';
    const unusedFeatures = personalData?.unusedFeatures || ['File Analysis', 'Model Selection', 'Chat History'];

    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: `${displayName}, discover hidden Uterpi features! 🔍`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Discover Uterpi Features</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 15px 0; }
            .feature { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 15px 0; border-left: 4px solid #ff6b6b; }
            .cta-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔍 Hidden Features Await${displayName}!</h1>
              <p style="margin: 0; opacity: 0.9;">Unlock the full power of Uterpi & Uterpi</p>
            </div>
            <div class="content">
              <h2>You're only using a fraction of Uterpi's capabilities!</h2>
              <p>We noticed you haven't explored some of our most powerful features yet. Here's what you're missing out on:</p>
              
                             ${unusedFeatures.map((feature: string) => {
                 const featureInfo = {
                  'File Analysis': {
                    icon: '📁',
                    description: 'Upload documents, spreadsheets, or images and get instant AI-powered insights and analysis.',
                    cta: 'Try File Analysis',
                    link: 'files'
                  },
                  'Model Selection': {
                    icon: '🤖',
                    description: 'Choose from different AI models optimized for specific tasks like coding, writing, or analysis.',
                    cta: 'Explore Models',
                    link: 'models'
                  },
                  'Chat History': {
                    icon: '💬',
                    description: 'Save, search, and continue your previous conversations. Never lose important insights again.',
                    cta: 'View History',
                    link: 'history'
                  }
                }[feature] || { icon: '✨', description: feature, cta: 'Learn More', link: '' };
                
                return `
                  <div class="feature">
                    <h3>${featureInfo.icon} ${feature}</h3>
                    <p>${featureInfo.description}</p>
                    <a href="${FRONTEND_URL}/${featureInfo.link}?utm_source=email&utm_campaign=feature_discovery&utm_content=${feature.toLowerCase().replace(' ', '_')}" class="button">${featureInfo.cta}</a>
                  </div>
                `;
              }).join('')}
              
              <div class="cta-box">
                <h3>🚀 Ready to Level Up?</h3>
                <p style="margin: 10px 0;">Take the full tour and discover all the ways Uterpi can boost your productivity.</p>
                <a href="${FRONTEND_URL}/tour?utm_source=email&utm_campaign=feature_discovery&utm_content=full_tour" style="display: inline-block; background: white; color: #667eea; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 10px 0;">Take the Full Tour</a>
              </div>
              
              <p>Questions about any of these features? Just reply to this email or check our <a href="${FRONTEND_URL}/help" style="color: #667eea;">help center</a>.</p>
              
              <p>Happy exploring!</p>
              <p>The Uterpi Team</p>
            </div>
            ${generateEmailFooter(unsubscribeToken, trackingPixel)}
          </div>
        </body>
        </html>
      `,
      text: `
Discover Hidden Uterpi Features${displayName}!

You're only using a fraction of Uterpi's capabilities! Here's what you're missing:

 ${unusedFeatures.map((feature: string) => `- ${feature}`).join('\n')}

Take the full tour: ${FRONTEND_URL}/tour

Questions? Check our help center: ${FRONTEND_URL}/help

Happy exploring!
The Uterpi Team
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending feature discovery email:', error);
      throw new Error(`Failed to send feature discovery email: ${error.message}`);
    }
    
    console.log('Feature discovery email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendFeatureDiscoveryEmail:', error);
    throw error;
  }
}

/**
 * Usage Insights Email - Weekly/Monthly stats
 */
export async function sendUsageInsightsEmail(options: EngagementEmailOptions): Promise<void> {
  try {
    const { to, name = '', unsubscribeToken, trackingPixel, personalData } = options;
    const displayName = name ? ` ${name}` : '';
    const period = personalData?.period || 'week';
    const stats = personalData?.stats || {};

    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: `Your ${period}ly Uterpi insights are here${displayName}! 📊`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Uterpi Insights</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 15px 0; }
            .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .stat-card { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; border: 2px solid #e9ecef; }
            .stat-number { font-size: 28px; font-weight: bold; color: #667eea; margin-bottom: 5px; }
            .achievement { background: #fff3cd; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Your ${period}ly insights${displayName}!</h1>
              <p style="margin: 0; opacity: 0.9;">See how you've been crushing it with AI</p>
            </div>
            <div class="content">
              <h2>Your productivity this ${period}</h2>
              <p>Here's a summary of your amazing progress with Uterpi:</p>
              
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-number">${stats.sessions || 0}</div>
                  <div>Sessions</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">${stats.messages || 0}</div>
                  <div>AI Messages</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">${stats.filesAnalyzed || 0}</div>
                  <div>Files Analyzed</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">${stats.timeSpent || 0}m</div>
                  <div>Time Spent</div>
                </div>
              </div>
              
              ${stats.achievements && stats.achievements.length > 0 ? `
                <div class="achievement">
                  <h3>🏆 This ${period}'s achievements</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    ${stats.achievements.map((achievement: string) => `<li>${achievement}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
              
              <h3>💡 Your most productive ${period === 'week' ? 'day' : 'week'}</h3>
              <p>You were most active on <strong>${stats.mostActiveDay || 'Wednesday'}</strong> with ${stats.mostActiveDayCount || 5} interactions!</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${FRONTEND_URL}/?utm_source=email&utm_campaign=usage_insights&utm_content=continue_streak" class="button">Keep the Momentum Going</a>
              </div>
              
              <p>Want to improve your productivity even more? Check out our <a href="${FRONTEND_URL}/tips?utm_source=email&utm_campaign=usage_insights" style="color: #667eea;">productivity tips</a>.</p>
              
              <p>Keep up the great work!</p>
              <p>The Uterpi Team</p>
            </div>
            ${generateEmailFooter(unsubscribeToken, trackingPixel)}
          </div>
        </body>
        </html>
      `,
      text: `
Your ${period}ly Uterpi insights${displayName}!

Your productivity this ${period}:
- ${stats.sessions || 0} sessions
- ${stats.messages || 0} AI messages  
- ${stats.filesAnalyzed || 0} files analyzed
- ${stats.timeSpent || 0}m time spent

Most productive ${period === 'week' ? 'day' : 'week'}: ${stats.mostActiveDay || 'Wednesday'}

Keep the momentum going: ${FRONTEND_URL}

Want productivity tips? Visit: ${FRONTEND_URL}/tips

Keep up the great work!
The Uterpi Team
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending usage insights email:', error);
      throw new Error(`Failed to send usage insights email: ${error.message}`);
    }
    
    console.log('Usage insights email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendUsageInsightsEmail:', error);
    throw error;
  }
}

/**
 * Product Tips Email
 */
export async function sendProductTipsEmail(options: EngagementEmailOptions): Promise<void> {
  try {
    const { to, name = '', unsubscribeToken, trackingPixel, personalData } = options;
    const displayName = name ? ` ${name}` : '';
    const tipCategory = personalData?.tipCategory || 'general';

    const tips = {
      general: [
        { title: "Be Specific in Your Questions", description: "Instead of 'help me write', try 'help me write a professional email to follow up on a job interview'", icon: "🎯" },
        { title: "Use Follow-up Questions", description: "Ask for clarification, examples, or different approaches to get exactly what you need", icon: "🔄" },
        { title: "Provide Context", description: "Share relevant background information to get more tailored and accurate responses", icon: "📝" }
      ],
      files: [
        { title: "Upload Multiple File Types", description: "Uterpi can analyze PDFs, spreadsheets, images, and text files for comprehensive insights", icon: "📁" },
        { title: "Ask Specific Analysis Questions", description: "Instead of 'analyze this', ask 'what are the key trends in this data?' or 'summarize the main points'", icon: "🔍" },
        { title: "Use File Analysis for Comparisons", description: "Upload similar documents and ask AI to compare differences or similarities", icon: "⚖️" }
      ],
      productivity: [
        { title: "Create Templates", description: "Ask AI to create reusable templates for emails, reports, or presentations", icon: "📋" },
        { title: "Break Down Complex Tasks", description: "Use AI to break large projects into manageable steps and action items", icon: "🧩" },
        { title: "Generate Multiple Options", description: "Ask for several different approaches or versions to find the best solution", icon: "🎨" }
      ]
    };

    const selectedTips = tips[tipCategory as keyof typeof tips] || tips.general;

    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: `${displayName}, here are your AI productivity tips! 💡`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>AI Productivity Tips</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 15px 0; }
            .tip { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745; }
            .tip-icon { font-size: 24px; margin-bottom: 10px; }
            .quote { background: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; font-style: italic; border-left: 4px solid #2196f3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💡 AI Productivity Tips${displayName}!</h1>
              <p style="margin: 0; opacity: 0.9;">Master the art of AI collaboration</p>
            </div>
            <div class="content">
              <h2>Level up your AI game with these Uterpi pro tips</h2>
              <p>Ready to become an AI productivity master? Here are some expert techniques to get better results from Uterpi:</p>
              
              ${selectedTips.map(tip => `
                <div class="tip">
                  <div class="tip-icon">${tip.icon}</div>
                  <h3>${tip.title}</h3>
                  <p>${tip.description}</p>
                </div>
              `).join('')}
              
              <div class="quote">
                <p>"The key to great AI results is asking the right questions. The more context and specificity you provide, the more valuable the AI's response will be."</p>
                <p><strong>- Uterpi Pro User</strong></p>
              </div>
              
              <h3>🚀 Ready to apply these tips?</h3>
              <p>Jump back into Uterpi and try out these techniques. You'll be amazed at the difference they make!</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${FRONTEND_URL}/?utm_source=email&utm_campaign=product_tips&utm_content=apply_tips" class="button">Apply These Tips Now</a>
              </div>
              
              <p>Have your own productivity tips to share? Reply to this email - we love hearing from our community!</p>
              
              <p>Happy optimizing!</p>
              <p>The Uterpi Team</p>
            </div>
            ${generateEmailFooter(unsubscribeToken, trackingPixel)}
          </div>
        </body>
        </html>
      `,
      text: `
AI Productivity Tips${displayName}!

Level up your AI game with these pro tips:

${selectedTips.map(tip => `${tip.icon} ${tip.title}\n${tip.description}\n`).join('\n')}

Ready to apply these tips? Visit: ${FRONTEND_URL}

Have your own tips to share? Reply to this email!

Happy optimizing!
The Uterpi Team
      `
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Error sending product tips email:', error);
      throw new Error(`Failed to send product tips email: ${error.message}`);
    }
    
    console.log('Product tips email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendProductTipsEmail:', error);
    throw error;
  }
} 