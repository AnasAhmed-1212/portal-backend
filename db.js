import mongoose from "mongoose";
import { env } from "./config/env.js";

const connectToDb = async () => {
  try {
    if (!env.mongoUrl) {
      throw new Error("Missing MONGO_URL (or MONGODB_URI) environment variable");
    }

    await mongoose.connect(env.mongoUrl, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("DB connected successfully");
    return mongoose.connection;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectToDb;
