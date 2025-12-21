// Auth Controller - Handles authentication routes
// Login, register, logout, password reset, Google OAuth

import type { Request, Response, NextFunction } from "express";
import passport from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { users, subscriptions, files } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { cancelSubscription } from "../stripe-consolidated";
import { 
  registerUserSchema, 
  loginUserSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema, 
  publicUserSchema 
} from "@shared/schema";
import { createError } from "../error-handler";

/**
 * Auth Controller - Handles all authentication-related routes
 */
export class AuthController {

  /**
   * Register new user
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = registerUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      
      // Automatically log in the user after registration
      req.login(user as any, (err) => {
        if (err) {
          console.error("Login after registration failed:", err);
          res.status(500).json({ error: "Registration successful but login failed" });
          return;
        }
        
        // Return public user data
        const publicUser = publicUserSchema.parse(user);
        res.status(201).json({ 
          success: true, 
          message: "User registered successfully",
          user: publicUser 
        });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      
      if (error.message?.includes("already exists")) {
        throw createError.conflict("User with this email already exists");
      } else if (error.issues) {
        throw createError.validation("Invalid registration data", error.issues);
      } else {
        throw createError.database("Failed to create user account", error);
      }
    }
  }

  /**
   * Login user
   */
  login(req: Request, res: Response, next: NextFunction): void {
    try {
      const validatedData = loginUserSchema.parse(req.body);
      
      passport.authenticate("local", (err: any, user: any, info: any) => {
        if (err) {
          console.error("Login error:", err);
          res.status(500).json({ error: "Login failed" });
          return;
        }
        
        if (!user) {
          res.status(401).json({ 
            error: info?.message || "Invalid email or password" 
          });
          return;
        }
        
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("Session creation failed:", loginErr);
            res.status(500).json({ error: "Login failed" });
            return;
          }
          
          res.json({ 
            success: true, 
            message: "Login successful",
            user: user
          });
        });
      })(req, res, next);
    } catch (error: any) {
      if (error.issues) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(400).json({ error: "Invalid login data" });
      }
    }
  }

  /**
   * Logout user
   */
  logout(req: Request, res: Response): void {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        res.status(500).json({ error: "Logout failed" });
        return;
      }
      
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("Session destruction failed:", sessionErr);
          res.status(500).json({ error: "Logout failed" });
          return;
        }
        
        res.json({ success: true, message: "Logout successful" });
      });
    });
  }

  /**
   * Get current user
   */
  getCurrentUser(req: Request, res: Response): void {
    res.json({ 
      success: true, 
      user: req.user 
    });
  }

  /**
   * Check authentication status
   */
  getAuthStatus(req: Request, res: Response): void {
    res.json({ 
      authenticated: req.isAuthenticated(),
      user: req.isAuthenticated() ? req.user : null
    });
  }

  /**
   * Google OAuth initiate
   */
  googleAuth(req: Request, res: Response, next: NextFunction): void {
    passport.authenticate("google", { 
      scope: ["profile", "email"] 
    })(req, res, next);
  }

  /**
   * Google OAuth callback
   */
  googleCallback(req: Request, res: Response, next: NextFunction): void {
    passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }, (err: any, user: any, info: any) => {
      if (err || !user) {
        res.redirect("/login?error=oauth_failed");
        return;
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          res.redirect("/login?error=oauth_failed");
          return;
        }
        res.redirect("/?auth=success");
      });
    })(req, res, next);
  }

  /**
   * Forgot password - send reset email
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = forgotPasswordSchema.parse(req.body);
      const { email } = validatedData;

      // Generate reset token
      const resetToken = await storage.generatePasswordResetToken(email);
      
      if (!resetToken) {
        // For security, don't reveal if email exists
        res.json({ 
          success: true, 
          message: "If an account with that email exists, a password reset link has been sent." 
        });
        return;
      }

      // Get user info for email personalization
      const user = await storage.getUserByEmail(email);
      const displayName = user?.firstName || user?.username || '';

      // Send password reset email
      const { sendPasswordResetEmail } = await import('../email');
      await sendPasswordResetEmail({
        to: email,
        name: displayName,
        resetToken
      });

      res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid email address", error.issues);
      } else {
        throw createError.database("Failed to process password reset request", error);
      }
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = resetPasswordSchema.parse(req.body);
      const { token, password } = validatedData;

      // Validate token and reset password
      const success = await storage.resetPassword(token, password);
      
      if (!success) {
        res.status(400).json({ error: "Invalid or expired reset token" });
        return;
      }

      // Get user info to send confirmation email
      const user = await storage.validatePasswordResetToken(token);
      if (user) {
        try {
          const { sendPasswordResetConfirmationEmail } = await import('../email');
          await sendPasswordResetConfirmationEmail(
            user.email, 
            user.firstName || user.username || ''
          );
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the password reset if confirmation email fails
        }
      }

      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
    } catch (error: any) {
      console.error("Reset password error:", error);
      if (error.issues) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to reset password" });
      }
    }
  }

  /**
   * Delete account
   */
  async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Fetch user subscriptions to cancel at period end
      const activeSubs = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

      // Cancel each subscription at period end (Stripe + local mirror)
      for (const sub of activeSubs) {
        if (sub.stripeSubscriptionId) {
          try {
            await cancelSubscription(sub.stripeSubscriptionId, true);
          } catch (e) {
            console.error("Stripe cancel at period end failed", e);
          }
        }

        // Mirror cancel_at_period_end locally
        await db
          .update(subscriptions)
          .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
      }

      // Soft-delete user files
      try {
        const userFiles = await db
          .select()
          .from(files)
          .where(eq(files.userId, userId));

        for (const f of userFiles) {
          await db
            .update(files)
            .set({ status: "deleted", updatedAt: new Date() })
            .where(eq(files.id, f.id));
        }
      } catch (e) {
        console.error("Soft-deleting user files failed", e);
      }

      // Mark user as deleted (soft-delete)
      await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Destroy session
      req.logout(() => {
        req.session.destroy(() => {
          res.json({ success: true, message: "Your account has been deleted. This cannot be undone." });
        });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  }
}

// Export singleton instance
export const authController = new AuthController();

