import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Seller from "../models/seller.js";
import { env, assertJwtEnv } from "../config/env.js";

const verifyUser = async (req, res, next) => {
  try {
    assertJwtEnv();

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authorization token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.jwtKey);

    const user = await User.findById(decoded._id)
      .select("-password")
      .populate("sellerId");

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated. Please contact admin.",
      });
    }

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
