import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import dotenv from "dotenv";
dotenv.config();

// Extend Express User interface to include our User type
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      emailVerified: boolean;
      avatar?: string | null;
      age?: number | null;
      dateOfBirth?: string | null;
      bio?: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
  }
}

// Serialize user for session storage
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    if (user) {
      // Return user without sensitive data
      const safeUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified ?? false,
        avatar: user.avatar,
        age: user.age,
        dateOfBirth: user.dateOfBirth,
        bio: user.bio,
        createdAt: user.createdAt ?? new Date(),
        updatedAt: user.updatedAt ?? new Date(),
      };
      done(null, safeUser as any);
    } else {
      done(null, false);
    }
  } catch (error) {
    console.error('Error deserializing user:', error);
    done(error, false);
  }
});

// Local authentication strategy (email/password)
passport.use(
  new LocalStrategy(
    {
      usernameField: "email", // Use email instead of username
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const user = await storage.verifyPassword(email, password);
        if (user) {
          // Return user without sensitive data
          const safeUser = {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            emailVerified: user.emailVerified ?? false,
            avatar: user.avatar,
            age: user.age,
            dateOfBirth: user.dateOfBirth,
            bio: user.bio,
            createdAt: user.createdAt ?? new Date(),
            updatedAt: user.updatedAt ?? new Date(),
          };
          return done(null, safeUser as any);
        } else {
          return done(null, false, { message: "Invalid email or password" });
        }
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Google OAuth strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract user data from Google profile
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile"), false);
          }

          const googleId = profile.id;
          const firstName = profile.name?.givenName;
          const lastName = profile.name?.familyName;
          const avatar = profile.photos?.[0]?.value;

          // Try to find existing user
          let user = await storage.getUserByGoogleId(googleId);
          
          if (!user) {
            // If no user found by Google ID, try by email
            user = await storage.getUserByEmail(email);
            
            if (user && !user.googleId) {
              // Link Google account to existing user
              user = await storage.linkGoogleAccount(user.id, googleId);
            }
          }

          if (!user) {
            // Create new OAuth user
            user = await storage.createOAuthUser({
              email,
              googleId,
              firstName,
              lastName,
              avatar,
              emailVerified: true, // Google emails are verified
            });
          }

          if (user) {
            // Return user without sensitive data
            const safeUser = {
              id: user.id,
              email: user.email,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              emailVerified: user.emailVerified ?? false,
              avatar: user.avatar,
              age: user.age,
              dateOfBirth: user.dateOfBirth,
              bio: user.bio,
              createdAt: user.createdAt ?? new Date(),
              updatedAt: user.updatedAt ?? new Date(),
            };
            return done(null, safeUser as any);
          } else {
            return done(new Error("Failed to create or find user"), false);
          }
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
} else {
  console.warn(
    "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables to enable Google authentication."
  );
}

// Middleware to check if user is authenticated
export const requireAuth = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};

// Middleware to check if user is not authenticated (for login/register routes)
export const requireGuest = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.status(400).json({ error: "Already authenticated" });
};

export default passport; 