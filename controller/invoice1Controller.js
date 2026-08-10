import Invoice from "../models/invoice1.js";
import Seller from "../models/seller.js";
import mongoose from "mongoose";

const FBR_PRODUCTION_POST_ENDPOINT = "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata";

const getUserSellerId = (user) => user?.sellerId?._id?.toString?.() || user?.sellerId?.toString?.() || null;

const getInvoiceTotal = (invoice) => {
  const itemsTotal = (invoice.items || []).reduce((sum, item) => sum + (Number(item.totalValues) || 0), 0);
  if (itemsTotal > 0) return itemsTotal;

  const fallbackTotals = [invoice?.amount, invoice?.totalAmount, invoice?.grandTotal]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return fallbackTotals.length ? fallbackTotals[0] : 0;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringValue = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const normalizeRegistrationNumber = (value) => {
  const compactValue = toStringValue(value, "").trim().replace(/[\s-]/g, "").toUpperCase();

  // FBR registration numbers can be a letter followed by six digits (for example, D389505).
  // Preserve that valid format while continuing to normalize numeric NTN/CNIC values.
  if (/^[A-Z]\d{6}$/.test(compactValue)) {
    return compactValue;
  }

  return compactValue.replace(/\D/g, "");
};

const toRateString = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "0%";
    return trimmed.includes("%") ? trimmed : `${trimmed}%`;
  }
  return `${toNumber(value, 0)}%`;
};

const toDateOnly = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const direct = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

const hasNegativeText = (value) => {
  if (!value || typeof value !== "string") return false;
  return /(invalid|error|failed|failure|rejected|not\s*valid|exception)/i.test(value);
};

const isSuccessCode = (code) => {
  const value = String(code ?? "").trim().toUpperCase();
  return value === "00" || value === "0" || value === "200" || value === "SUCCESS" || value === "SUCCESSFUL";
};

const validateFbrPublishResponse = (httpOk, responseBody) => {
  if (!httpOk) {
    return { isValid: false, reason: "HTTP status is not successful" };
  }

  if (!responseBody || typeof responseBody !== "object") {
    return { isValid: false, reason: "FBR response is not valid JSON object" };
  }

  if (responseBody.success === false) {
    return { isValid: false, reason: "FBR success flag is false" };
  }

  if (responseBody.error || (Array.isArray(responseBody.errors) && responseBody.errors.length > 0)) {
    return { isValid: false, reason: "FBR returned error details" };
  }

  if (hasNegativeText(responseBody.message) || hasNegativeText(responseBody.status)) {
    return { isValid: false, reason: "FBR response message indicates failure" };
  }

  const candidateCodes = [
    responseBody.statusCode,
    responseBody.responseCode,
    responseBody.code,
    responseBody?.validationResponse?.statusCode,
    responseBody?.validationResponse?.responseCode,
  ].filter((code) => code !== undefined && code !== null && String(code).trim() !== "");

  if (candidateCodes.length > 0 && !candidateCodes.some((code) => isSuccessCode(code))) {
    return { isValid: false, reason: "FBR response code is not successful" };
  }

  return { isValid: true, reason: "FBR response accepted" };
};

const extractInvoiceNumber = (responseBody) => {
  if (!responseBody || typeof responseBody !== "object") return "";

  const candidates = [
    responseBody.invoiceNumber,
    responseBody.invoicenumber,
    responseBody.invoiceNo,
    responseBody.invoice_no,
    responseBody?.data?.invoiceNumber,
    responseBody?.data?.invoiceNo,
    responseBody?.validationResponse?.invoiceNumber,
    responseBody?.validationResponse?.invoiceNo,
    responseBody?.invoiceStatuses?.[0]?.invoiceNumber,
    responseBody?.invoiceStatuses?.[0]?.invoiceNo,
  ];

  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return found ? String(found).trim() : "";
};

const extractFbrError = (responseBody) => {
  const validation = responseBody?.validationResponse;
  const errors = [];

  if (validation?.errorCode) errors.push(`FBR ${validation.errorCode}`);
  if (typeof validation?.error === "string" && validation.error.trim()) {
    errors.push(validation.error.trim());
  }

  const itemStatuses = validation?.invoiceStatuses || responseBody?.invoiceStatuses;
  for (const itemStatus of Array.isArray(itemStatuses) ? itemStatuses : []) {
    const itemError = itemStatus?.error || itemStatus?.errorDescription || itemStatus?.errorCode;
    if (itemError) errors.push(String(itemError));
  }

  if (errors.length) return [...new Set(errors)].join(": ");
  if (typeof responseBody?.message === "string" && responseBody.message.trim()) {
    return responseBody.message.trim();
  }
  return "FBR rejected invoice payload";
};

const validateFbrPayloadPattern = (payload) => {
  const topLevelSchema = {
    invoiceType: "string",
    invoiceDate: "date",
    sellerNTNCNIC: "string",
    sellerBusinessName: "string",
    sellerProvince: "string",
    sellerAddress: "string",
    buyerNTNCNIC: "string",
    buyerBusinessName: "string",
    buyerProvince: "string",
    buyerAddress: "string",
    buyerRegistrationType: "string",
    invoiceRefNo: "string",
    scenarioId: "string",
    items: "array",
  };

  const itemSchema = {
    hsCode: "string",
    productDescription: "string",
    rate: "string",
    uoM: "string",
    quantity: "number",
    totalValues: "number",
    valueSalesExcludingST: "number",
    fixedNotifiedValueOrRetailPrice: "number",
    salesTaxApplicable: "number",
    salesTaxWithheldAtSource: "number",
    extraTax: "number-or-string",
    furtherTax: "number",
    sroScheduleNo: "string",
    fedPayable: "number",
    discount: "number",
    saleType: "string",
    sroItemSerialNo: "string",
  };

  for (const [key, type] of Object.entries(topLevelSchema)) {
    if (!(key in payload)) {
      return { valid: false, error: `Missing required field: ${key}` };
    }

    if (type === "date") {
      if (typeof payload[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload[key])) {
        return { valid: false, error: `Invalid date format for ${key}. Expected yyyy-MM-dd` };
      }
      continue;
    }

    if (type === "array") {
      if (!Array.isArray(payload[key])) {
        return { valid: false, error: `Invalid type for ${key}. Expected array` };
      }
      continue;
    }

    if (typeof payload[key] !== type) {
      return { valid: false, error: `Invalid type for ${key}. Expected ${type}` };
    }
  }

  if (!payload.items.length) {
    return { valid: false, error: "At least one item is required in items array" };
  }

  for (const field of ["sellerNTNCNIC", "buyerNTNCNIC"]) {
    if (!/^(?:\d{7}|\d{13}|[A-Z]\d{6})$/.test(payload[field])) {
      return {
        valid: false,
        error: `${field} must contain 7 digits, 13 digits, or a letter followed by 6 digits`,
      };
    }
  }

  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index];
    for (const [key, type] of Object.entries(itemSchema)) {
      if (!(key in item)) {
        return { valid: false, error: `Missing required item field: items[${index}].${key}` };
      }

      if (type === "number-or-string") {
        if (typeof item[key] !== "number" && typeof item[key] !== "string") {
          return {
            valid: false,
            error: `Invalid type for items[${index}].${key}. Expected number or string`,
          };
        }
        continue;
      }

      if (typeof item[key] !== type) {
        return {
          valid: false,
          error: `Invalid type for items[${index}].${key}. Expected ${type}`,
        };
      }
    }

    if (!item.productDescription.trim()) {
      return { valid: false, error: `items[${index}].productDescription is required` };
    }

  }

  return { valid: true };
};

const buildFbrPayload = (invoice) => ({
  invoiceType: toStringValue(invoice.invoiceType, "Sale Invoice"),
  invoiceDate: toDateOnly(invoice.invoiceDate),
  sellerNTNCNIC: normalizeRegistrationNumber(invoice.sellerNTNCNIC),
  sellerBusinessName: toStringValue(invoice.sellerBusinessName, ""),
  sellerProvince: toStringValue(invoice.sellerProvince, ""),
  sellerAddress: toStringValue(invoice.sellerAddress, ""),
  buyerNTNCNIC: normalizeRegistrationNumber(invoice.buyerNTNCNIC),
  buyerBusinessName: toStringValue(invoice.buyerBusinessName, ""),
  buyerProvince: toStringValue(invoice.buyerProvince, ""),
  buyerAddress: toStringValue(invoice.buyerAddress, ""),
  buyerRegistrationType: toStringValue(invoice.buyerRegistrationType, "Registered"),
  invoiceRefNo: toStringValue(invoice.invoiceRefNo, ""),
  scenarioId: toStringValue(invoice.scenarioId, "SN000"),
  items: (invoice.items || []).map((item) => ({
    hsCode: toStringValue(item.hsCode, ""),
    productDescription: toStringValue(item.productDescription, ""),
    rate: toRateString(item.rate),
    uoM: toStringValue(item.uoM, ""),
    quantity: toNumber(item.quantity, 0),
    totalValues: 0,
    valueSalesExcludingST: toNumber(item.valueSalesExcludingST, 0),
    fixedNotifiedValueOrRetailPrice: toNumber(item.fixedNotifiedValueOrRetailPrice, 0),
    salesTaxApplicable: toNumber(item.salesTaxApplicable, 0),
    salesTaxWithheldAtSource: toNumber(item.salesTaxWithheldAtSource, 0),
    extraTax:
      item.extraTax === "" || item.extraTax === undefined || item.extraTax === null
        ? ""
        : toNumber(item.extraTax, 0),
    furtherTax: toNumber(item.furtherTax, 0),
    sroScheduleNo: toStringValue(item.sroScheduleNo, ""),
    fedPayable: toNumber(item.fedPayable, 0),
    discount: toNumber(item.discount, 0),
    saleType: toStringValue(item.saleType, ""),
    sroItemSerialNo: toStringValue(item.sroItemSerialNo, ""),
  })),
});

export const createInvoice = async (req, res) => {
  try {
    const invoiceData = { ...req.body };
    const currentUserSellerId = getUserSellerId(req.user);

    if (req.user.role !== "admin") {
      if (!currentUserSellerId) {
        return res.status(400).json({
          success: false,
          error: "User is not assigned to any seller",
        });
      }
      invoiceData.sellerId = currentUserSellerId;
    } else if (!invoiceData.sellerId) {
      return res.status(400).json({
        success: false,
        error: "Seller is required for invoice creation",
      });
    } else {
      const assignedSeller = await Seller.findById(invoiceData.sellerId);
      if (!assignedSeller) {
        return res.status(404).json({ success: false, error: "Assigned seller not found" });
      }
      if (!assignedSeller.isActive) {
        return res.status(400).json({ success: false, error: "Assigned seller is inactive" });
      }
    }

    const newInvoice = new Invoice(invoiceData);
    const savedInvoice = await newInvoice.save();

    res.status(201).json({
      success: true,
      message: "Invoice generated successfully",
      data: savedInvoice,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

export const getAllInvoices = async (req, res) => {
  try {
    const query = {};
    const currentUserSellerId = getUserSellerId(req.user);

    if (req.user.role !== "admin") {
      if (!currentUserSellerId) {
        return res.status(400).json({ success: false, error: "User is not assigned to any seller" });
      }
      query.sellerId = currentUserSellerId;
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByIdInvoices = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Invoice ID format",
      });
    }

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const currentUserSellerId = getUserSellerId(req.user);
    if (req.user.role !== "admin") {
      if (!currentUserSellerId || invoice.sellerId.toString() !== currentUserSellerId) {
        return res.status(403).json({
          success: false,
          message: "Access denied - You can only view your seller's invoices",
        });
      }
    }

    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

export const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const currentUserSellerId = getUserSellerId(req.user);
    if (req.user.role !== "admin") {
      if (!currentUserSellerId || invoice.sellerId.toString() !== currentUserSellerId) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only update your seller's invoices",
        });
      }
    }

    if (invoice.isPublished) {
      return res.status(400).json({
        success: false,
        error: "Published invoice cannot be edited",
      });
    }

    const allowedFields = [
      "invoiceType",
      "invoiceDate",
      "sellerNTNCNIC",
      "sellerBusinessName",
      "sellerProvince",
      "sellerAddress",
      "buyerNTNCNIC",
      "buyerBusinessName",
      "buyerProvince",
      "buyerAddress",
      "buyerRegistrationType",
      "invoiceRefNo",
      "scenarioId",
      "items",
      "sellerId",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (req.user.role !== "admin") {
      updates.sellerId = currentUserSellerId;
    } else if (updates.sellerId) {
      const assignedSeller = await Seller.findById(updates.sellerId);
      if (!assignedSeller) {
        return res.status(404).json({ success: false, error: "Assigned seller not found" });
      }
      if (!assignedSeller.isActive) {
        return res.status(400).json({ success: false, error: "Assigned seller is inactive" });
      }
    }

    if (updates.items && (!Array.isArray(updates.items) || updates.items.length === 0)) {
      return res.status(400).json({ success: false, error: "At least one item is required" });
    }

    Object.assign(invoice, updates);
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: invoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update invoice",
    });
  }
};

export const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const currentUserSellerId = getUserSellerId(req.user);
    if (req.user.role !== "admin") {
      if (!currentUserSellerId || invoice.sellerId.toString() !== currentUserSellerId) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only delete your seller's invoices",
        });
      }
    }

    await Invoice.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: invoice.isPublished
        ? "Published invoice deleted successfully"
        : "Invoice deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to delete invoice",
    });
  }
};

export const publishInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const currentUserSellerId = getUserSellerId(req.user);
    if (req.user.role !== "admin") {
      if (!currentUserSellerId || invoice.sellerId.toString() !== currentUserSellerId) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only publish your seller's invoices",
        });
      }
    }

    if (invoice.isPublished) {
      return res.status(400).json({ success: false, error: "Invoice is already published" });
    }

    const seller = await Seller.findById(invoice.sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller not found for this invoice" });
    }
    if (!seller.isActive) {
      return res.status(400).json({ success: false, error: "Assigned seller is inactive" });
    }
    if (!seller.fbrToken) {
      return res.status(400).json({ success: false, error: "FBR token not configured for assigned seller" });
    }

    const fbrPayload = buildFbrPayload(invoice);
    const payloadValidation = validateFbrPayloadPattern(fbrPayload);
    if (!payloadValidation.valid) {
      return res.status(422).json({
        success: false,
        error: "FBR payload does not match required JSON pattern",
        validationError: payloadValidation.error,
        requestPayload: fbrPayload,
      });
    }

    let fbrResponse;
    try {
      fbrResponse = await fetch(FBR_PRODUCTION_POST_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${seller.fbrToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(fbrPayload),
        signal: AbortSignal.timeout(30000),
      });
    } catch (networkError) {
      return res.status(502).json({
        success: false,
        error: "Failed to reach FBR API from server",
        validationError: networkError?.message || "fetch failed",
        requestPayload: fbrPayload,
      });
    }

    const rawBody = await fbrResponse.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = { raw: rawBody };
    }

    const responseValidation = validateFbrPublishResponse(fbrResponse.ok, parsedBody);

    if (!responseValidation.isValid) {
      return res.status(fbrResponse.ok ? 422 : fbrResponse.status).json({
        success: false,
        error: extractFbrError(parsedBody),
        validationError: responseValidation.reason,
        requestPayload: fbrPayload,
        fbrResponse: parsedBody,
      });
    }

    invoice.isPublished = true;
    invoice.publishedAt = new Date();
    invoice.fbrResponse = parsedBody;
    const fbrInvoiceNumber = extractInvoiceNumber(parsedBody);
    if (fbrInvoiceNumber) {
      invoice.invoiceNumber = fbrInvoiceNumber;
    }
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: parsedBody?.message || "Invoice published successfully",
      data: invoice,
      requestPayload: fbrPayload,
      fbrResponse: parsedBody,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to publish invoice",
    });
  }
};

export const markInvoicePublished = async (req, res) => {
  try {
    const { id } = req.params;
    const { fbrResponse, requestPayload } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const currentUserSellerId = getUserSellerId(req.user);
    if (req.user.role !== "admin") {
      if (!currentUserSellerId || invoice.sellerId.toString() !== currentUserSellerId) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only publish your seller's invoices",
        });
      }
    }

    if (invoice.isPublished) {
      return res.status(400).json({ success: false, error: "Invoice is already published" });
    }

    invoice.isPublished = true;
    invoice.publishedAt = new Date();
    const fbrInvoiceNumber = extractInvoiceNumber(fbrResponse);
    if (fbrInvoiceNumber) {
      invoice.invoiceNumber = fbrInvoiceNumber;
    }
    invoice.fbrResponse = {
      ...(typeof fbrResponse === "object" && fbrResponse ? fbrResponse : { raw: fbrResponse || "" }),
      requestPayload: requestPayload || null,
      publishedVia: "frontend-fallback",
    };
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Invoice marked as published successfully",
      data: invoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to mark invoice as published",
    });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const query = {};
    const currentUserSellerId = getUserSellerId(req.user);

    if (req.user.role !== "admin") {
      if (!currentUserSellerId) {
        return res.status(400).json({ success: false, error: "User is not assigned to any seller" });
      }
      query.sellerId = currentUserSellerId;
    }

    const invoices = await Invoice.find(query).select(
      "items isPublished createdAt invoiceDate amount totalAmount grandTotal"
    );

    const totalInvoices = invoices.length;
    const publishedInvoices = invoices.filter((inv) => inv.isPublished).length;
    const unpublishedInvoices = totalInvoices - publishedInvoices;
    const totalRevenue = invoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);

    const monthlyMap = new Map();
    const monthKeys = [];
    const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      monthKeys.push(monthKey);
      monthlyMap.set(monthKey, { month: monthFormatter.format(monthDate), revenue: 0, published: 0, total: 0 });
    }

    invoices.forEach((invoice) => {
      let date = null;
      if (invoice.invoiceDate) {
        const parsedInvoiceDate = new Date(invoice.invoiceDate);
        if (!Number.isNaN(parsedInvoiceDate.getTime())) {
          date = parsedInvoiceDate;
        }
      }
      if (!date) {
        date = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap.has(monthKey)) return;

      const revenue = getInvoiceTotal(invoice);
      const current = monthlyMap.get(monthKey);
      current.revenue += revenue;
      current.total += 1;
      if (invoice.isPublished) current.published += 1;
    });

    const revenueSeries = monthKeys.map((key) => {
      const value = monthlyMap.get(key);
      return {
        month: value.month,
        revenue: Number(value.revenue.toFixed(2)),
        published: value.published,
        total: value.total,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        totalInvoices,
        publishedInvoices,
        unpublishedInvoices,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        revenueSeries,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
