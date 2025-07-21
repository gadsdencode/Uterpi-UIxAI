import { Resend } from 'resend';

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email - should be configured in environment or use a verified domain
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@nomadai.app';

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
    const finalResetUrl = resetUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    
    const displayName = name ? ` ${name}` : '';
    
    const emailData = {
      from: FROM_EMAIL,
      to: [to],
      subject: 'Reset Your Password - NomadAI',
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
              <p>We received a request to reset your password for your NomadAI account. If you made this request, click the button below to reset your password:</p>
              
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
              
              <p>Best regards,<br>The NomadAI Team</p>
            </div>
            <div class="footer">
              <p>© 2025 NomadAI. All rights reserved.</p>
              <p>This email was sent to ${to}. If you didn't request this, you can safely ignore it.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello${displayName}!

We received a request to reset your password for your NomadAI account.

To reset your password, visit this link:
${finalResetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email.

Best regards,
The NomadAI Team

---
© 2025 NomadAI. All rights reserved.
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
      subject: 'Password Successfully Reset - NomadAI',
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
              
              <p>This email confirms that your NomadAI account password was changed successfully. You can now log in with your new password.</p>
              
              <p>If you didn't make this change, please contact our support team immediately as your account may be compromised.</p>
              
              <p>For security reasons, we recommend:</p>
              <ul>
                <li>Using a strong, unique password</li>
                <li>Enabling two-factor authentication if available</li>
                <li>Not sharing your password with anyone</li>
              </ul>
              
              <p>Best regards,<br>The NomadAI Team</p>
            </div>
            <div class="footer">
              <p>© 2025 NomadAI. All rights reserved.</p>
              <p>This email was sent to ${to}.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello${displayName}!

Your password has been successfully reset!

This email confirms that your NomadAI account password was changed successfully. You can now log in with your new password.

If you didn't make this change, please contact our support team immediately.

Best regards,
The NomadAI Team

---
© 2025 NomadAI. All rights reserved.
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