import express from "express";
import {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
} from "../controller/itemController.js";
import authMiddleware from "../middleWare/authMiddleware.js";

const router = express.Router();

router.post("/add", authMiddleware , createItem);
router.get("/add", authMiddleware , getItems);
router.get("/item/:id", authMiddleware , getItemById);
router.put("/item/:id", authMiddleware , updateItem);
router.delete("/item/:id", authMiddleware , deleteItem);

export default router;