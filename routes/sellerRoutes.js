import express from "express";
import { addSeller, getSellers, getSellerById, updateSeller, deleteSeller, toggleSellerStatus } from "../controller/sellerController.js";
import verifyUser from "../middleWare/authMiddleware.js";
import { requireAdmin } from "../middleWare/roleMiddleware.js";

const router = express.Router();
router.use(verifyUser);

// @route   POST /api/seller/add
// @desc    Create a new seller
router.post("/add", requireAdmin, addSeller);

// @route   GET /api/seller
// @desc    Get all sellers
router.get("/", requireAdmin, getSellers);

// @route   GET /api/seller/:id
// @desc    Get single seller by ID
router.get("/:id", getSellerById);

// @route   PUT /api/seller/:id
// @desc    Update seller
router.put("/:id", requireAdmin, updateSeller);

// @route   DELETE /api/seller/:id
// @desc    Delete seller
router.delete("/:id", requireAdmin, deleteSeller);

// @route   PUT /api/seller/:id/toggle-status
// @desc    Toggle seller active status
router.put("/:id/toggle-status", requireAdmin, toggleSellerStatus);

export default router;
