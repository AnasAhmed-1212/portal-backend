import express from "express";
import authMiddleware from "../middleWare/authMiddleware.js";
import { requireAdmin } from "../middleWare/roleMiddleware.js";
import {
  createSandboxSeller,
  deleteSandboxSeller,
  getSandboxScenarios,
  getSandboxSellers,
  resetSandboxProgress,
  runSandboxScenario,
  updateSandboxSeller,
} from "../controller/sandboxController.js";

const router = express.Router();
router.use(authMiddleware, requireAdmin);

router.get("/scenarios", getSandboxScenarios);
router.get("/sellers", getSandboxSellers);
router.post("/sellers", createSandboxSeller);
router.put("/sellers/:sellerId", updateSandboxSeller);
router.delete("/sellers/:sellerId", deleteSandboxSeller);
router.delete("/sellers/:sellerId/progress", resetSandboxProgress);
router.post("/run", runSandboxScenario);

export default router;
