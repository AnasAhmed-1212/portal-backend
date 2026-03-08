import express from "express";
import {
  createBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
  deleteBuyer
} from "../controller/buyerController.js";
import authMiddleware from "../middleWare/authMiddleware.js";

const router = express.Router();

router.post("/", authMiddleware , createBuyer);
router.get("/", authMiddleware , getAllBuyers);
router.get("/:id", authMiddleware , getBuyerById);
router.put("/:id", authMiddleware , updateBuyer);
router.delete("/:id", authMiddleware , deleteBuyer);

export default router;