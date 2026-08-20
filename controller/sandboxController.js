import mongoose from "mongoose";
import SandboxBuyer from "../models/sandboxBuyer.js";
import SandboxSeller from "../models/sandboxSeller.js";
import { getSandboxScenario, sandboxScenarios } from "../config/sandboxScenarios.js";

const SANDBOX_ENDPOINTS = {
  validate: "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb",
  post: "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb",
};

const normalizeRegistrationNumber = (value) => {
  const compactValue = String(value || "").trim().replace(/[\s-]/g, "").toUpperCase();

  // An FBR NTN may be a letter followed by six digits (for example, D389505).
  // Preserve that format instead of stripping the alphabetic prefix.
  if (/^[A-Z]\d{6}$/.test(compactValue)) return compactValue;

  return compactValue.replace(/\D/g, "");
};
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const cleanToken = (value) =>
  String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();

const parseResponseBody = async (response) => {
  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody);
  } catch {
    try {
      return JSON.parse(rawBody.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return { raw: rawBody };
    }
  }
};

const extractFbrError = (responseBody) => {
  const validation = responseBody?.validationResponse;
  if (typeof validation?.error === "string" && validation.error.trim()) return validation.error;

  const itemErrors = (validation?.invoiceStatuses || [])
    .map((entry) => entry?.error || entry?.errorDescription || entry?.errorCode)
    .filter(Boolean);
  if (itemErrors.length) return itemErrors.join("; ");
  if (typeof responseBody?.message === "string" && responseBody.message.trim()) return responseBody.message;
  return "FBR rejected the sandbox scenario";
};

const serializeSeller = (seller) => ({
  _id: String(seller._id),
  sellerNTNCNIC: seller.sellerNTNCNIC,
  sellerBusinessName: seller.sellerBusinessName,
  sellerProvince: seller.sellerProvince,
  sellerAddress: seller.sellerAddress,
  hasSandboxToken: Boolean(seller.sandboxToken),
  isAssigned: Boolean(seller.isAssigned),
  scenarioResults: seller.scenarioResults || [],
  createdAt: seller.createdAt,
  updatedAt: seller.updatedAt,
});

const validateSellerFields = (body) => {
  const sellerNTNCNIC = normalizeRegistrationNumber(body.sellerNTNCNIC);

  const fields = {
    sellerNTNCNIC,
    sellerBusinessName: String(body.sellerBusinessName || "").trim(),
    sellerProvince: String(body.sellerProvince || "").trim(),
    sellerAddress: String(body.sellerAddress || "").trim(),
  };
  if (!fields.sellerBusinessName || !fields.sellerProvince || !fields.sellerAddress) {
    return { error: "All sandbox seller fields are required" };
  }
  return { fields };
};

const validateBuyerFields = (body) => {
  const buyerNTNCNIC = normalizeRegistrationNumber(body.buyerNTNCNIC);
  if (!/^(?:\d{7}|\d{13}|[A-Z]\d{6})$/.test(buyerNTNCNIC)) {
    return { error: "Sandbox buyer NTN/CNIC must contain 7 digits, 13 digits, or a letter followed by 6 digits" };
  }

  const fields = {
    buyerNTNCNIC,
    buyerBusinessName: String(body.buyerBusinessName || "").trim(),
    buyerProvince: String(body.buyerProvince || "").trim(),
    buyerAddress: String(body.buyerAddress || "").trim(),
    buyerRegistrationType: String(body.buyerRegistrationType || "").trim(),
    invoiceRefNo: String(body.invoiceRefNo || "").trim(),
  };
  if (!fields.buyerBusinessName || !fields.buyerProvince || !fields.buyerAddress) {
    return { error: "All sandbox buyer fields except invoice reference number are required" };
  }
  if (!["Registered", "Unregistered"].includes(fields.buyerRegistrationType)) {
    return { error: "Sandbox buyer registration type must be Registered or Unregistered" };
  }
  return { fields };
};

export const getSandboxScenarios = async (_req, res) =>
  res.status(200).json({ success: true, data: sandboxScenarios });

export const getSandboxSellers = async (_req, res) => {
  const sellers = await SandboxSeller.find()
    .select("+sandboxToken")
    .sort({ createdAt: -1 });
  return res.status(200).json({ success: true, data: sellers.map(serializeSeller) });
};

export const createSandboxSeller = async (req, res) => {
  try {
    const validation = validateSellerFields(req.body);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });

    const sandboxToken = cleanToken(req.body.sandboxToken);
    if (!sandboxToken) return res.status(400).json({ success: false, error: "Sandbox token is required" });

    const existing = await SandboxSeller.findOne({ sellerNTNCNIC: validation.fields.sellerNTNCNIC });
    if (existing) {
      return res.status(409).json({ success: false, error: "A sandbox seller with this NTN/CNIC already exists" });
    }

    const seller = await SandboxSeller.create({
      ...validation.fields,
      sandboxToken,
      isAssigned: true,
      createdBy: req.user._id,
    });
    const savedSeller = await SandboxSeller.findById(seller._id).select("+sandboxToken");
    return res.status(201).json({
      success: true,
      message: "Sandbox seller assigned successfully",
      data: serializeSeller(savedSeller),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateSandboxSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
    }

    const seller = await SandboxSeller.findById(sellerId).select("+sandboxToken");
    if (!seller) return res.status(404).json({ success: false, error: "Sandbox seller not found" });

    const validation = validateSellerFields(req.body);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });

    const sandboxToken = cleanToken(req.body.sandboxToken) || seller.sandboxToken;

    Object.assign(seller, validation.fields, {
      sandboxToken,
      isAssigned: true,
    });
    await seller.save();
    return res.status(200).json({
      success: true,
      message: "Sandbox seller assignment updated",
      data: serializeSeller(seller),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const deleteSandboxSeller = async (req, res) => {
  const { sellerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
  }

  const deleted = await SandboxSeller.findByIdAndDelete(sellerId);
  if (!deleted) return res.status(404).json({ success: false, error: "Sandbox seller not found" });
  await SandboxBuyer.deleteMany({ sellerId });
  return res.status(200).json({ success: true, message: "Sandbox seller removed" });
};

export const getSandboxBuyers = async (req, res) => {
  const { sellerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
  }
  const sellerExists = await SandboxSeller.exists({ _id: sellerId });
  if (!sellerExists) return res.status(404).json({ success: false, error: "Sandbox seller not found" });

  const buyers = await SandboxBuyer.find({ sellerId }).sort({ createdAt: -1 });
  return res.status(200).json({ success: true, data: buyers });
};

export const createSandboxBuyer = async (req, res) => {
  try {
    const { sellerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
    }
    const sellerExists = await SandboxSeller.exists({ _id: sellerId });
    if (!sellerExists) return res.status(404).json({ success: false, error: "Sandbox seller not found" });

    const validation = validateBuyerFields(req.body);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });

    const existing = await SandboxBuyer.findOne({
      sellerId,
      buyerNTNCNIC: validation.fields.buyerNTNCNIC,
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "This sandbox buyer is already saved for the selected seller",
      });
    }

    const buyer = await SandboxBuyer.create({
      sellerId,
      ...validation.fields,
      createdBy: req.user._id,
    });
    return res.status(201).json({
      success: true,
      message: "Sandbox buyer added successfully",
      data: buyer,
    });
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 409 : 500).json({
      success: false,
      error: duplicate
        ? "This sandbox buyer is already saved for the selected seller"
        : error.message,
    });
  }
};

export const updateSandboxBuyer = async (req, res) => {
  try {
    const { buyerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buyerId)) {
      return res.status(400).json({ success: false, error: "Invalid sandbox buyer id" });
    }

    const buyer = await SandboxBuyer.findById(buyerId);
    if (!buyer) return res.status(404).json({ success: false, error: "Sandbox buyer not found" });

    const validation = validateBuyerFields(req.body);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });

    const duplicate = await SandboxBuyer.exists({
      _id: { $ne: buyerId },
      sellerId: buyer.sellerId,
      buyerNTNCNIC: validation.fields.buyerNTNCNIC,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "This sandbox buyer is already saved for the selected seller",
      });
    }

    Object.assign(buyer, validation.fields);
    await buyer.save();
    return res.status(200).json({
      success: true,
      message: "Sandbox buyer updated successfully",
      data: buyer,
    });
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 409 : 500).json({
      success: false,
      error: duplicate
        ? "This sandbox buyer is already saved for the selected seller"
        : error.message,
    });
  }
};

export const deleteSandboxBuyer = async (req, res) => {
  const { buyerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    return res.status(400).json({ success: false, error: "Invalid sandbox buyer id" });
  }

  const deleted = await SandboxBuyer.findByIdAndDelete(buyerId);
  if (!deleted) return res.status(404).json({ success: false, error: "Sandbox buyer not found" });
  return res.status(200).json({ success: true, message: "Sandbox buyer removed" });
};

const buildSandboxPayload = (seller, scenarioConfig, buyer, item) => ({
  invoiceType: "Sale Invoice",
  invoiceDate: new Date().toISOString().slice(0, 10),
  sellerNTNCNIC: normalizeRegistrationNumber(seller.sellerNTNCNIC),
  sellerBusinessName: seller.sellerBusinessName,
  sellerProvince: seller.sellerProvince,
  sellerAddress: seller.sellerAddress,
  buyerNTNCNIC: normalizeRegistrationNumber(buyer.buyerNTNCNIC),
  buyerBusinessName: String(buyer.buyerBusinessName || "").trim(),
  buyerProvince: String(buyer.buyerProvince || "").trim(),
  buyerAddress: String(buyer.buyerAddress || "").trim(),
  buyerRegistrationType: buyer.buyerRegistrationType || scenarioConfig.buyerRegistrationType,
  invoiceRefNo: String(buyer.invoiceRefNo || ""),
  scenarioId: scenarioConfig.id,
  items: [
    {
      hsCode: String(item.hsCode || ""),
      productDescription: String(item.productDescription || ""),
      rate: String(item.rate || ""),
      uoM: String(item.uoM || ""),
      quantity: toNumber(item.quantity),
      totalValues: toNumber(item.totalValues),
      valueSalesExcludingST: toNumber(item.valueSalesExcludingST),
      fixedNotifiedValueOrRetailPrice: toNumber(item.fixedNotifiedValueOrRetailPrice),
      salesTaxApplicable: toNumber(item.salesTaxApplicable),
      salesTaxWithheldAtSource: toNumber(item.salesTaxWithheldAtSource),
      extraTax: item.extraTax === "" ? "" : toNumber(item.extraTax),
      furtherTax: toNumber(item.furtherTax),
      sroScheduleNo: String(item.sroScheduleNo || ""),
      fedPayable: toNumber(item.fedPayable),
      discount: toNumber(item.discount),
      saleType: String(item.saleType || ""),
      sroItemSerialNo: String(item.sroItemSerialNo || ""),
      ...(String(item.saleType || "").trim().toLowerCase() === "petroleum products"
        ? { petroleumLevyOn: toNumber(item.petroleumLevyOn, Number.NaN) }
        : {}),
    },
  ],
});

export const runSandboxScenario = async (req, res) => {
  try {
    const { sellerId, scenarioId, action = "validate", buyer = {}, item = {} } = req.body;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
    }

    const scenarioConfig = getSandboxScenario(scenarioId);
    if (!scenarioConfig) return res.status(400).json({ success: false, error: "Invalid sandbox scenario" });
    if (!SANDBOX_ENDPOINTS[action]) return res.status(400).json({ success: false, error: "Invalid sandbox action" });

    const seller = await SandboxSeller.findById(sellerId).select("+sandboxToken");
    if (!seller) return res.status(404).json({ success: false, error: "Sandbox seller not found" });
    if (!seller.isAssigned || !seller.sandboxToken) {
      return res.status(400).json({ success: false, error: "Assign the sandbox seller and token before running scenarios" });
    }

    const payload = buildSandboxPayload(seller, scenarioConfig, buyer, { ...scenarioConfig.item, ...item });
    if (!/^(?:\d{7}|\d{13}|[A-Z]\d{6})$/.test(payload.buyerNTNCNIC)) {
      return res.status(400).json({ success: false, error: "Buyer NTN/CNIC must contain 7 digits, 13 digits, or a letter followed by 6 digits" });
    }
    if (
      payload.items[0].saleType.trim().toLowerCase() === "petroleum products" &&
      (!Number.isFinite(payload.items[0].petroleumLevyOn) || payload.items[0].petroleumLevyOn < 0)
    ) {
      return res.status(400).json({ success: false, error: "Petroleum Levy On must be a non-negative number for Petroleum Products" });
    }

    const fbrResponse = await fetch(SANDBOX_ENDPOINTS[action], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${seller.sandboxToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const responseBody = await parseResponseBody(fbrResponse);

    const statusCode = String(responseBody?.validationResponse?.statusCode || responseBody?.statusCode || "");
    const validationStatus = String(responseBody?.validationResponse?.status || "").toLowerCase();
    const accepted = fbrResponse.ok && (
      statusCode === "00" || validationStatus === "valid" || Boolean(responseBody?.invoiceNumber)
    );
    const index = seller.scenarioResults.findIndex((entry) => entry.scenarioId === scenarioId);
    const previousResult = index >= 0 ? seller.scenarioResults[index] : null;
    const status = accepted
      ? action === "post"
        ? "Cleared"
        : previousResult?.status === "Cleared"
          ? "Cleared"
          : "Valid"
      : "Failed";
    const now = new Date();
    const result = {
      scenarioId,
      status,
      lastResponse: responseBody,
      validatedAt: accepted && action === "validate" ? now : previousResult?.validatedAt || null,
      clearedAt: accepted && action === "post" ? now : previousResult?.clearedAt || null,
    };

    if (index >= 0) seller.scenarioResults[index] = result;
    else seller.scenarioResults.push(result);
    await seller.save();

    return res.status(accepted ? 200 : 422).json({
      success: accepted,
      status,
      sellerAssigned: seller.isAssigned,
      fbrHttpStatus: fbrResponse.status,
      requestPayload: payload,
      fbrResponse: responseBody,
      error: accepted ? undefined : extractFbrError(responseBody),
    });
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    return res.status(timedOut ? 504 : 500).json({
      success: false,
      error: timedOut ? "FBR sandbox request timed out" : error.message || "Sandbox request failed",
    });
  }
};

export const resetSandboxProgress = async (req, res) => {
  const { sellerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return res.status(400).json({ success: false, error: "Invalid sandbox seller id" });
  }
  const result = await SandboxSeller.updateOne(
    { _id: sellerId },
    { $set: { scenarioResults: [] } }
  );
  if (!result.matchedCount) return res.status(404).json({ success: false, error: "Sandbox seller not found" });
  return res.status(200).json({ success: true, message: "Sandbox scenario progress reset" });
};
