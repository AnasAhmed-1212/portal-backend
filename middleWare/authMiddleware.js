// 
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Seller from "../models/seller.js";

const verifyUser = async (req, res, next) => {
  try {
    // ✅ CHECK HEADER FIRST
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authorization token missing",
      });
    }

    // ✅ EXTRACT TOKEN SAFELY
    const token = authHeader.split(" ")[1];

    // ✅ VERIFY TOKEN
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    // ✅ FIND USER WITH SELLER INFO
    const user = await User.findById(decoded._id).select("-password").populate("sellerId");

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    // ✅ CHECK IF USER IS ACTIVE
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated. Please contact admin.",
      });
    }

    // ✅ CHECK IF ASSIGNED SELLER IS ACTIVE (for non-admin users)
    if (user.role !== "admin" && user.sellerId) {
      const sellerId = user.sellerId?._id || user.sellerId;
      const seller = await Seller.findById(sellerId);
      if (seller && !seller.isActive) {
        return res.status(403).json({
          success: false,
          error: "Your assigned seller account is inactive. Please contact admin.",
        });
      }
    }

    // ✅ ATTACH USER TO REQUEST
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);

    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

export default verifyUser;
