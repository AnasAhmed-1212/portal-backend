import express from "express";
import { login, verify } from "../controller/authControl.js";
import authMiddleware from "../middleWare/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.get("/verify", authMiddleware, verify);

export default router;
