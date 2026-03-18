import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectToDb from "./db.js";
import { assertMongoEnv } from "./config/env.js";
import authRouter from './routes/auth.js';
import BuyerRoutes from "./routes/buyerRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js"
import invoiceRouters from "./routes/invoice1.js"
import userRouter from "./routes/user.js";

dotenv.config();
const app = express();
let dbConnectionPromise = null;
let envValidationError = null;

try {
  assertMongoEnv();
} catch (error) {
  envValidationError = error;
  console.error(error.message);
}

const ensureDbConnection = async () => {
  if (envValidationError) {
    throw envValidationError;
  }

  if (mongoose.connection.readyState === 1) return;

  if (!dbConnectionPromise) {
    dbConnectionPromise = connectToDb()
      .then(() => {
        if (mongoose.connection.readyState !== 1) {
          throw new Error("Database connection failed");
        }
      })
      .finally(() => {
        if (mongoose.connection.readyState !== 1) {
          dbConnectionPromise = null;
        }
      });
  }

  await dbConnectionPromise;
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public/uploads"));
app.use(async (req, res, next) => {
  try {
    await ensureDbConnection();
    next();
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ message: "Database connection failed" });
  }
});
app.use("/api/auth", authRouter);
app.use("/api/buyer", BuyerRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/user", userRouter);
app.use("/api/create", invoiceRouters);

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 2703;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
export default app;
