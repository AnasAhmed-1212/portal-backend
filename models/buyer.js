import mongoose from "mongoose";

const { Schema } = mongoose;

const BuyerSchema = new Schema({
  // Multi-tenancy: Link to seller
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  
  buyerName: {
    type: String,
    required: true,
    trim: true
  },
  buyerBusinessName: {
    type: String,
    required: true,
    trim: true
  },
  ntnNumber: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  province: {
    type: String,
    required: true,
    trim: true
  },
  registrationType: {
    type: String,
    enum: ["Registered", "Unregistered"],
    default: "Registered"
  }
}, { timestamps: true });

// Index for efficient queries by seller
BuyerSchema.index({ sellerId: 1 });

const Buyer = mongoose.model("Buyer", BuyerSchema);

export default Buyer;
