import Seller from "../models/seller.js"

export const addSeller = async (req, res) => {
  try {
    const {
      sellerNTNCNIC,
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      fbrToken,
      sellerEmail,
      sellerPhone,
      isActive,
    } = req.body;

    // Check if seller already exists
    const existingSeller = await Seller.findOne({ sellerNTNCNIC });
    if (existingSeller) {
      return res.status(400).json({ success: false, error: "Seller with this NTN/CNIC already exists" });
    }

    const newSeller = new Seller({
      sellerNTNCNIC,
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      fbrToken,
      sellerEmail,
      sellerPhone,
      createdBy: req.user?._id,
      isActive: isActive !== undefined ? isActive : false,
    });

    await newSeller.save();

    res.status(201).json({
      success: true,
      message: "Seller added successfully",
      data: newSeller
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSellers = async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: sellers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single seller by ID
export const getSellerById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller not found" });
    }

    // Non-admin users can only access their assigned seller record
    const currentUserSellerId = req.user?.sellerId?._id?.toString?.() || req.user?.sellerId?.toString?.();
    if (req.user.role !== "admin" && (!currentUserSellerId || seller._id.toString() !== currentUserSellerId)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    res.status(200).json({ success: true, data: seller });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update seller
export const updateSeller = async (req, res) => {
  try {
    const { sellerNTNCNIC, sellerBusinessName, sellerProvince, sellerAddress, fbrToken, sellerEmail, sellerPhone, isActive } = req.body;

    const updateData = {
      sellerNTNCNIC,
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      fbrToken,
      sellerEmail,
      sellerPhone
    };

    // Include isActive if provided (for admin to toggle status)
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller not found" });
    }

    res.status(200).json({
      success: true,
      message: "Seller updated successfully",
      data: seller
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete seller
export const deleteSeller = async (req, res) => {
  try {
    const seller = await Seller.findByIdAndDelete(req.params.id);

    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller not found" });
    }

    res.status(200).json({
      success: true,
      message: "Seller deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Toggle seller active status
export const toggleSellerStatus = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);

    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller not found" });
    }

    seller.isActive = !seller.isActive;
    await seller.save();

    res.status(200).json({
      success: true,
      message: seller.isActive ? "Seller activated successfully" : "Seller deactivated successfully",
      data: seller
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
