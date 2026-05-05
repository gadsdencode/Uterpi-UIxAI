// Conversation Routes
// Handles chat conversations, vectorization, and message management

import { Router } from "express";
import { requireAuth } from "../auth";
import { conversationController } from "../controllers";

const router = Router();

// =============================================================================
// VECTORIZATION ROUTES
// =============================================================================

router.post("/api/test/vectorization", requireAuth, (req, res) => 
  conversationController.testVectorization(req, res));

router.get("/api/vectorization/status", requireAuth, (req, res) => 
  conversationController.getVectorizationStatus(req, res));

// =============================================================================
// CONVERSATION ROUTES
// =============================================================================

// List conversations
router.get("/api/conversations", requireAuth, (req, res) => 
  conversationController.getConversations(req, res));

// Get messages for a conversation
router.get("/api/conversations/:id/messages", requireAuth, (req, res) => 
  conversationController.getMessages(req, res));

// Update conversation title
router.patch("/api/conversations/:id/title", requireAuth, (req, res) => 
  conversationController.updateTitle(req, res));

// Archive conversation
router.patch("/api/conversations/:id/archive", requireAuth, (req, res) => 
  conversationController.archive(req, res));

// Unarchive conversation
router.patch("/api/conversations/:id/unarchive", requireAuth, (req, res) => 
  conversationController.unarchive(req, res));

// Delete conversation
router.delete("/api/conversations/:id", requireAuth, (req, res) => 
  conversationController.delete(req, res));

// Star/unstar conversation
router.patch("/api/conversations/:id/star", requireAuth, (req, res) => 
  conversationController.star(req, res));

// Export single conversation
router.get("/api/conversations/:id/export", requireAuth, (req, res) => 
  conversationController.exportConversation(req, res));

// Bulk export conversations
router.post("/api/conversations/export/bulk", requireAuth, (req, res) => 
  conversationController.exportBulk(req, res));

export default router;
