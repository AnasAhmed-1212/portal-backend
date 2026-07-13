import mongoose from "mongoose";

const scenarioResultSchema = new mongoose.Schema(
  {
    scenarioId: { type: String, required: true },
    status: {
      type: String,
      enum: ["Pending", "Valid", "Cleared", "Failed"],
      default: "Pending",
    },
    lastResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    validatedAt: { type: Date, default: null },
    clearedAt: { type: Date, default: null },
  },
  { _id: false }
);

const sandboxSellerSchema = new mongoose.Schema(
  {
    sandboxToken: { type: String, required: true, trim: true, select: false },
    sellerNTNCNIC: { type: String, required: true, unique: true, trim: true },
    sellerBusinessName: { type: String, required: true, trim: true },
    sellerProvince: { type: String, required: true, trim: true },
    sellerAddress: { type: String, required: true, trim: true },
    isAssigned: { type: Boolean, default: true },
    scenarioResults: { type: [scenarioResultSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const SandboxSeller = mongoose.model("SandboxSeller", sandboxSellerSchema);
export default SandboxSeller;
