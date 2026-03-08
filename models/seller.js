import mongoose from "mongoose";
const { Schema } = mongoose;

const sellerSchema = new mongoose.Schema({
  sellerNTNCNIC: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  sellerBusinessName: {
    type: String,
    required: true,
    trim: true,
  },
  sellerProvince: {
    type: String,
    required: true,
  },
  sellerAddress: {
    type: String,
    required: true,
  },
  // FBR API Token - stored securely for each seller
  fbrToken: {
    type: String,
    required: true,
    trim: true,
  },
  // Activation status - seller can only access if active
  isActive: {
    type: Boolean,
    default: false,
  },
  // Admin who created this seller
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Contact information
  sellerEmail: {
    type: String,
    trim: true,
  },
  sellerPhone: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

const Seller = mongoose.model("Seller", sellerSchema);
export default Seller;
