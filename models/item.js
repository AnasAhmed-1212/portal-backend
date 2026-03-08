import mongoose from "mongoose";
const { Schema } = mongoose;

const itemSchema = new mongoose.Schema(
  {
    // Multi-tenancy: Link to seller
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true
    },
    
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    hsCode: {
      type: String,
      required: true,
    },
    unitOfMeasurement: {
      type: String,
      required: true,
    },
    itemSaleType: {
      type: String,
      required: true, // adjust if needed
    },
    taxRate: {
      type: String,
      required: true,
      min: 0,
    },
    sroSchedule: {
      type: String,
      default: "",
    },
    sroItem: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Index for efficient queries by seller
itemSchema.index({ sellerId: 1 });

const Item = mongoose.model("Item", itemSchema);

export default Item;
