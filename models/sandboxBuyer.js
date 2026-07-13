import mongoose from "mongoose";

const sandboxBuyerSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SandboxSeller",
      required: true,
      index: true,
    },
    buyerNTNCNIC: { type: String, required: true, trim: true },
    buyerBusinessName: { type: String, required: true, trim: true },
    buyerProvince: { type: String, required: true, trim: true },
    buyerAddress: { type: String, required: true, trim: true },
    buyerRegistrationType: {
      type: String,
      enum: ["Registered", "Unregistered"],
      required: true,
    },
    invoiceRefNo: { type: String, default: "", trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

sandboxBuyerSchema.index({ sellerId: 1, buyerNTNCNIC: 1 }, { unique: true });

const SandboxBuyer = mongoose.model("SandboxBuyer", sandboxBuyerSchema);
export default SandboxBuyer;
