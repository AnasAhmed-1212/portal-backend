import express from "express";
import {
  createInvoice,
  getAllInvoices,
  getByIdInvoices,
  updateInvoice,
  publishInvoice,
  markInvoicePublished,
  getDashboardStats,
} from "../controller/invoice1Controller.js";
import authMiddleware from "../middleWare/authMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// Dashboard analytics
router.get("/stats/dashboard", getDashboardStats);

// POST: Create a new invoice
router.post("/items", createInvoice);

// GET: Fetch all invoices
router.get("/", getAllInvoices);
router.put("/:id", updateInvoice);

// POST: Publish invoice to FBR and persist status
router.post("/:id/publish", publishInvoice);
router.post("/:id/mark-published", markInvoicePublished);

router.get("/:id", getByIdInvoices);

export default router;
