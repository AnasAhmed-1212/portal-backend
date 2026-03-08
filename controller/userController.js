import User from "../models/user.js";
import Seller from "../models/seller.js";
import bcrypt from "bcrypt";

// GET /api/user/profile
const getProfile = async (req, res) => {
  try {
    // req.user is added by auth middleware
    res.status(200).json({ success: true, user: req.user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/user/profile
const updateProfile = async (req, res) => {
  try {
    const updates = {};
    const allowed = ["name", "email", "password"];
    allowed.forEach((key) => {
      if (req.body[key]) updates[key] = req.body[key];
    });

    // if password provided, hash in model pre-save
    const user = await User.findById(req.user._id);
    Object.assign(user, updates);
    await user.save();

    const safe = user.toObject();
    delete safe.password;
    res.status(200).json({ success: true, user: safe });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// GET /api/user/all (admin only)
const listUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const users = await User.find().select("-password").populate("sellerId", "sellerBusinessName isActive");
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// CREATE new user (admin only)
const createUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden - Admin access required" });
    }

    const { name, email, password, role, sellerId, isActive } = req.body;
    const normalizedRole = role || "Employee";

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "User with this email already exists" });
    }

    if (normalizedRole === "Employee" && !sellerId) {
      return res.status(400).json({ success: false, error: "Employee must be assigned to a seller" });
    }

    // If assigning to a seller, verify seller exists and is active
    if (sellerId) {
      const seller = await Seller.findById(sellerId);
      if (!seller) {
        return res.status(404).json({ success: false, error: "Seller not found" });
      }
      if (!seller.isActive) {
        return res.status(400).json({ success: false, error: "Cannot assign user to inactive seller. Please activate the seller first." });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: normalizedRole,
      sellerId: normalizedRole === "admin" ? null : sellerId,
      isActive: isActive !== undefined ? isActive : true
    });

    await newUser.save();

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// UPDATE user (admin only)
const updateUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden - Admin access required" });
    }

    const { id } = req.params;
    const { name, email, role, sellerId, isActive, password } = req.body;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const nextRole = role || user.role;
    const hasSellerUpdate = Object.prototype.hasOwnProperty.call(req.body, "sellerId");
    const nextSellerId = hasSellerUpdate ? sellerId : user.sellerId?.toString() || null;

    if (nextRole === "Employee" && !nextSellerId) {
      return res.status(400).json({ success: false, error: "Employee must be assigned to a seller" });
    }

    // If changing seller, verify new seller exists and is active
    if (nextSellerId && nextSellerId !== user.sellerId?.toString()) {
      const seller = await Seller.findById(nextSellerId);
      if (!seller) {
        return res.status(404).json({ success: false, error: "Seller not found" });
      }
      if (!seller.isActive) {
        return res.status(400).json({ success: false, error: "Cannot assign user to inactive seller" });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (hasSellerUpdate) user.sellerId = sellerId || null;
    if (nextRole === "admin") user.sellerId = null;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE user (admin only)
const deleteUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden - Admin access required" });
    }

    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: "Cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// TOGGLE user active status (admin only)
const toggleUserStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden - Admin access required" });
    }

    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // If activating, check if seller is active
    if (!user.isActive && user.sellerId) {
      const seller = await Seller.findById(user.sellerId);
      if (seller && !seller.isActive) {
        return res.status(400).json({ 
          success: false, 
          error: "Cannot activate user. Their assigned seller is inactive. Please activate the seller first." 
        });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: user.isActive ? "User activated successfully" : "User deactivated successfully",
      data: user
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET all sellers (for admin to assign)
const getSellersForAssignment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Return all sellers (both active and inactive) so admin can see all options
    const sellers = await Seller.find().select("sellerBusinessName sellerNTNCNIC isActive").sort({ sellerBusinessName: 1 });
    res.status(200).json({ success: true, data: sellers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export { 
  getProfile, 
  updateProfile, 
  listUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  toggleUserStatus,
  getSellersForAssignment 
};
