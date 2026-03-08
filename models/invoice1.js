import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  hsCode: { type: String, required: true },
  productDescription: { type: String, required: true },
  rate: { type: String, required: true }, // Tax percentage string like "18%"
  uoM: { type: String, required: true },
  quantity: { type: Number, required: true },
  totalValues: { type: Number, required: true },
  valueSalesExcludingST: { type: Number, required: true },
  fixedNotifiedValueOrRetailPrice: { type: Number, default: 0.0 }, 
  salesTaxApplicable: { type: Number, required: true },
  
  // Fields to match FBR JSON requirements
  salesTaxWithheldAtSource: { type: Number, default: 0 },
  extraTax: { type: mongoose.Schema.Types.Mixed, default: "" }, 
  furtherTax: { type: Number, default: 0 },
  sroScheduleNo: { type: String, default: "" },
  fedPayable: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  
  // Mixed allows for both Number 0 or String "" as per FBR validation
  
  saleType: { type: String, required: true },
  sroItemSerialNo: { type: String, default: "" }
});

const invoiceSchema = new mongoose.Schema({
  // Multi-tenancy: Link to seller
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  
  invoiceNumber: { type: String,  },
  invoiceType: { type: String, required: true }, 
  invoiceDate: { type: String, required: true }, // Format: YYYY-MM-DD
  
  sellerBusinessName: { type: String, required: true },
  sellerProvince: { type: String, required: true },
  sellerNTNCNIC: { type: String, required: true },
  sellerAddress: { type: String, required: true },
  
  buyerNTNCNIC: { type: String, required: true },
  buyerBusinessName: { type: String, required: true },
  buyerProvince: { type: String, required: true },
  buyerAddress: { type: String, required: true },
  
  invoiceRefNo: { type: String, default: "" },
  scenarioId: { type: String, default: "SN001" },
  buyerRegistrationType: { type: String, default: "Registered" }, 
  
  // Published status - tracks if invoice was submitted to FBR
  isPublished: {
    type: Boolean,
    default: false
  },
  
  // FBR Response tracking
  fbrResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  
  items: [itemSchema]
}, { timestamps: true });

// Index for efficient queries by seller
invoiceSchema.index({ sellerId: 1, createdAt: -1 });
invoiceSchema.index({ sellerId: 1, isPublished: 1 });

// Exporting as "Invoice" for better clarity in your controller
const Invoice = mongoose.model("create", invoiceSchema);
export default Invoice;
