import express from "express";
import mongoose from "mongoose";
import Seller from "../models/seller.js";
import verifyUser from "../middleWare/authMiddleware.js";
import { decryptToken, tokenContext } from "../security/tokenVault.js";

// Client input can choose only these read-only operations, never an upstream host or arbitrary path.
const endpoints = {
  provinces: ["v1/provinces", []],
  itemdesccode: ["v1/itemdesccode", []],
  transtypecode: ["v1/transtypecode", []],
  HS_UOM: ["v2/HS_UOM", ["hs_code", "annexure_id"]],
  SaleTypeToRate: ["v2/SaleTypeToRate", ["date", "transTypeId", "originationSupplier"]],
  SroSchedule: ["v1/SroSchedule", ["rate_id", "date", "origination_supplier_csv"]],
  SROItem: ["v2/SROItem", ["date", "sro_id"]],
};
export const createReferenceRouter = ({ fetchImpl = fetch } = {}) => {
  const router = express.Router();
  router.use(verifyUser);
  router.get("/:operation", async (req, res) => {
    const entry = Object.hasOwn(endpoints, req.params.operation) ? endpoints[req.params.operation] : null;
    if (!entry) return res.status(404).json({ success: false, error: "Unknown reference operation" });
    const [path, allowed] = entry;
    for (const [key, value] of Object.entries(req.query)) {
      if (![...allowed, "sellerId"].includes(key) || typeof value !== "string" || value.length > 120) {
        return res.status(400).json({ success: false, error: "Invalid reference query" });
      }
    }
    const assignedId = String(req.user.sellerId?._id || req.user.sellerId || "");
    const sellerId = req.user.role === "admin" ? req.query.sellerId : assignedId;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) return res.status(400).json({ success: false, error: "Select a seller" });
    if (req.user.role !== "admin" && req.query.sellerId && req.query.sellerId !== assignedId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    try {
      const seller = await Seller.findById(sellerId).select("+fbrToken");
      if (!seller || !seller.isActive) return res.status(403).json({ success: false, error: "Active seller required" });
      const token = decryptToken(seller.fbrToken, tokenContext("Seller", seller._id, "fbrToken"));
      const url = new URL(`https://gw.fbr.gov.pk/pdi/${path}`);
      for (const key of allowed) if (req.query[key] !== undefined) url.searchParams.set(key, req.query[key]);
      const upstream = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!upstream.ok) return res.status(502).json({ success: false, error: "FBR reference request failed" });
      const body = await upstream.json();
      // Do not forward upstream headers, credentials, or arbitrary diagnostic objects.
      const data = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(data)) return res.status(502).json({ success: false, error: "Invalid FBR reference response" });
      res.set("Cache-Control", "no-store");
      return res.json(data);
    } catch {
      return res.status(502).json({ success: false, error: "Unable to load FBR reference data. Check server token configuration." });
    }
  });
  return router;
};
export default createReferenceRouter();
