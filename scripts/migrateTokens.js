import "dotenv/config";
import mongoose from "mongoose";
import connectToDb from "../db.js";
import Seller from "../models/seller.js";
import SandboxSeller from "../models/sandboxSeller.js";
import { encryptToken, decryptToken, isEncryptedToken, tokenContext, getTokenKey } from "../security/tokenVault.js";

// Idempotent, compare-and-set migration. Never print credentials or database URLs.
export async function migrateCollection(model, field, flag) {
  let migrated = 0;
  let verified = 0;
  for await (const doc of model.collection.find({}, { projection: { [field]: 1 } })) {
    const value = doc[field];
    if (typeof value !== "string" || !value.trim()) throw new Error("Missing token; repair seller before migration");
    const context = tokenContext(model.modelName, doc._id, field);
    const encrypted = isEncryptedToken(value) ? value : encryptToken(value, context);
    decryptToken(encrypted, context);
    const result = await model.collection.updateOne(
      { _id: doc._id, [field]: value },
      { $set: { [field]: encrypted, ...(flag ? { [flag]: true } : {}) } },
    );
    if (result.matchedCount !== 1) throw new Error("Seller changed during migration; rerun migration");
    if (encrypted !== value) migrated += 1;
    else verified += 1;
  }
  return { migrated, verified };
}

async function main() {
  try {
    getTokenKey();
    await connectToDb();
    console.log("Production:", await migrateCollection(Seller, "fbrToken", "hasFbrToken"));
    console.log("Sandbox:", await migrateCollection(SandboxSeller, "sandboxToken"));
  } catch {
    console.error("Token migration failed. Check the encryption key and database configuration; no secrets were printed.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
