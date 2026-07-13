import express from "express";
import authMiddleware from "../middleWare/authMiddleware.js";
import { requireAdmin } from "../middleWare/roleMiddleware.js";
import {
  createSandboxBuyer,
  createSandboxSeller,
  deleteSandboxBuyer,
  deleteSandboxSeller,
  getSandboxBuyers,
  getSandboxScenarios,
  getSandboxSellers,
  resetSandboxProgress,
  runSandboxScenario,
  updateSandboxBuyer,
  updateSandboxSeller,
} from "../controller/sandboxController.js";

const router = express.Router();
router.use(authMiddleware, requireAdmin);

router.get("/scenarios", getSandboxScenarios);
router.get("/sellers", getSandboxSellers);
router.post("/sellers", createSandboxSeller);
router.put("/sellers/:sellerId", updateSandboxSeller);
router.delete("/sellers/:sellerId", deleteSandboxSeller);
router.get("/sellers/:sellerId/buyers", getSandboxBuyers);
router.post("/sellers/:sellerId/buyers", createSandboxBuyer);
router.put("/buyers/:buyerId", updateSandboxBuyer);
router.delete("/buyers/:buyerId", deleteSandboxBuyer);
router.delete("/sellers/:sellerId/progress", resetSandboxProgress);
router.post("/run", runSandboxScenario);

export default router;
