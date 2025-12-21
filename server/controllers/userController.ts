// User Controller - Handles user profile routes
// Profile CRUD operations

import type { Request, Response } from "express";
import { storage } from "../storage";
import { updateProfileSchema } from "@shared/schema";
import { createError } from "../error-handler";

/**
 * User Controller - Handles all user profile-related routes
 */
export class UserController {

  /**
   * Get user profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      // Validate user authentication
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        throw createError.notFound('User');
      }
      
      // Return public user data (excluding password and sensitive info)
      const profile = {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        age: user.age,
        dateOfBirth: user.dateOfBirth,
        bio: user.bio,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      res.json({ 
        success: true, 
        profile 
      });
    } catch (error: any) {
      console.error("Get profile error:", error);
      
      if (error instanceof Error && error.name.includes('Error')) {
        throw error;
      } else {
        throw createError.database("Failed to get profile", error);
      }
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      // Validate user authentication
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }

      const validatedData = updateProfileSchema.parse(req.body);
      
      // Check if username is being updated and if it's already taken
      if (validatedData.username && validatedData.username !== req.user.username) {
        const existingUser = await storage.getUserByUsername(validatedData.username);
        if (existingUser && existingUser.id !== req.user.id) {
          throw createError.conflict("Username already taken");
        }
      }

      // Verify user exists before updating
      const existingUser = await storage.getUser(req.user.id);
      if (!existingUser) {
        throw createError.notFound('User');
      }

      const updatedUser = await storage.updateUserProfile(req.user.id, validatedData);
      
      if (!updatedUser) {
        throw createError.database('Failed to update user profile');
      }

      // Return public user data
      const profile = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        avatar: updatedUser.avatar,
        age: updatedUser.age,
        dateOfBirth: updatedUser.dateOfBirth,
        bio: updatedUser.bio,
        emailVerified: updatedUser.emailVerified,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      res.json({ 
        success: true, 
        message: "Profile updated successfully",
        profile 
      });
    } catch (error: any) {
      console.error("Update profile error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid profile data", error.issues);
      } else if (error instanceof Error && error.name.includes('Error')) {
        throw error;
      } else {
        throw createError.database("Failed to update profile", error);
      }
    }
  }
}

// Export singleton instance
export const userController = new UserController();

