import Buyer from "../models/buyer.js";

// ✅ Create Buyer
const createBuyer = async (req, res) => {
  try {
    const buyerData = req.body;
    
    // For non-admin users, assign the buyer to their seller
    if (req.user.role !== "admin" && req.user.sellerId) {
      buyerData.sellerId = req.user.sellerId._id;
    }
    
    const buyer = new Buyer(buyerData);
    const savedBuyer = await buyer.save();

    res.status(201).json({
      success: true,
      message: "Buyer created successfully",
      data: savedBuyer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ✅ Get All Buyers
const getAllBuyers = async (req, res) => {
  try {
    let query = {};
    
    // For non-admin users, only show their seller's buyers
    if (req.user.role !== "admin" && req.user.sellerId) {
      query.sellerId = req.user.sellerId._id;
    }
    
    const buyers = await Buyer.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: buyers.length,
      data: buyers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ✅ Get Single Buyer
const getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        error: "Buyer not found"
      });
    }

    // Check access - non-admin users can only view their seller's buyers
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (buyer.sellerId && buyer.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only view your seller's buyers"
        });
      }
    }

    res.status(200).json({
      success: true,
      data: buyer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ✅ Update Buyer
const updateBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        error: "Buyer not found"
      });
    }

    // Check access - non-admin users can only update their seller's buyers
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (buyer.sellerId && buyer.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only update your seller's buyers"
        });
      }
    }

    const updatedBuyer = await Buyer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Buyer updated successfully",
      data: updatedBuyer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ✅ Delete Buyer
const deleteBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        error: "Buyer not found"
      });
    }

    // Check access - non-admin users can only delete their seller's buyers
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (buyer.sellerId && buyer.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only delete your seller's buyers"
        });
      }
    }

    const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Buyer deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export {
  createBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
  deleteBuyer
};
