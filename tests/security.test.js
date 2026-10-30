import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Seller from "../models/seller.js";
import SandboxSeller from "../models/sandboxSeller.js";
import Buyer from "../models/buyer.js";
import Item from "../models/item.js";
import User from "../models/user.js";
import Invoice from "../models/invoice1.js";
import { encryptToken, decryptToken, tokenContext, getTokenKey } from "../security/tokenVault.js";
import { createReferenceRouter } from "../routes/fbrReference.js";
import { migrateCollection } from "../scripts/migrateTokens.js";
import { login, verify } from "../controller/authControl.js";
import { updateBuyer, getAllBuyers } from "../controller/buyerController.js";
import { updateItem, getItems } from "../controller/itemController.js";
import { updateProfile } from "../controller/userController.js";
import { createInvoice, publishInvoice } from "../controller/invoice1Controller.js";
import { updateSeller } from "../controller/sellerController.js";
import invoiceRouter from "../routes/invoice1.js";

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.JWT_KEY = randomBytes(32).toString("hex");
const sellerId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const employee = { _id: userId, role: "Employee", isActive: true, sellerId: { _id: sellerId, isActive: true } };
const context = tokenContext("Seller", sellerId, "fbrToken");
const secret = "test-fbr-secret-never-return";
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const originals = [];
const stub = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value; };
beforeEach(() => { while (originals.length) { const [o, k, v] = originals.pop(); o[k] = v; } });
after(() => { while (originals.length) { const [o, k, v] = originals.pop(); o[k] = v; } });

test("token encryption is randomized, authenticated, seller-bound and rejects plaintext", () => {
  const a = encryptToken(secret, context), b = encryptToken(secret, context);
  assert.notEqual(a, b);
  assert.equal(a.includes(secret), false);
  assert.equal(decryptToken(a, context), secret);
  assert.throws(() => decryptToken(a, tokenContext("Seller", otherId, "fbrToken")));
  assert.throws(() => decryptToken(a, tokenContext("SandboxSeller", sellerId, "sandboxToken")));
  const parts = a.split(":");
  const bytes = Buffer.from(parts[4], "base64"); bytes[0] ^= 1; parts[4] = bytes.toString("base64");
  assert.throws(() => decryptToken(parts.join(":"), context));
  assert.throws(() => decryptToken(secret, context), /migration/);
});

test("missing/wrong encryption keys fail closed", () => {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  const encrypted = encryptToken(secret, context);
  try {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.throws(getTokenKey);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    assert.throws(() => decryptToken(encrypted, context));
  } finally { process.env.TOKEN_ENCRYPTION_KEY = key; }
});

test("production and sandbox model saves encrypt storage and redact all serialization", async () => {
  for (const [model, field] of [[Seller, "fbrToken"], [SandboxSeller, "sandboxToken"]]) {
    let stored;
    stub(model.collection, "insertOne", async (doc) => { stored = doc; return { acknowledged: true, insertedId: doc._id }; });
    const doc = new model({ sellerNTNCNIC: "1234567", sellerBusinessName: "Test", sellerProvince: "Sindh", sellerAddress: "Test", createdBy: userId, [field]: secret });
    await doc.save();
    assert.equal(decryptToken(stored[field], tokenContext(model.modelName, doc._id, field)), secret);
    assert.equal(doc.toJSON()[field], undefined);
    assert.equal(doc.toObject()[field], undefined);
    assert.equal(JSON.stringify({ sellerId: doc }).includes(secret), false);
    assert.equal(model.schema.path(field).options.select, false);
    if (model === Seller) assert.equal(doc.hasFbrToken, true);
  }
});

test("migration encrypts legacy values, verifies encrypted values, and uses compare-and-set", async () => {
  const rows = [{ _id: sellerId, fbrToken: secret }];
  const fake = { modelName: "Seller", collection: {
    find: () => (async function* () { yield* rows; })(),
    async updateOne(filter, update) {
      assert.equal(filter.fbrToken, rows[0].fbrToken);
      Object.assign(rows[0], update.$set);
      return { matchedCount: 1 };
    },
  } };
  assert.deepEqual(await migrateCollection(fake, "fbrToken", "hasFbrToken"), { migrated: 1, verified: 0 });
  assert.equal(rows[0].hasFbrToken, true);
  assert.equal(decryptToken(rows[0].fbrToken, context), secret);
  assert.deepEqual(await migrateCollection(fake, "fbrToken", "hasFbrToken"), { migrated: 0, verified: 1 });
});

test("auth responses contain configuration status but no FBR credential", async () => {
  const user = { ...employee, name: "Test", email: "test@example.invalid", password: await bcrypt.hash("test-password", 4), sellerId: new Seller({ _id: sellerId, fbrToken: secret, hasFbrToken: true, isActive: true }) };
  stub(User, "findOne", () => ({ populate: async () => user }));
  stub(Seller, "findById", async () => user.sellerId);
  const res = response();
  await login({ body: { email: user.email, password: "test-password" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.sellerId.hasFbrToken, true);
  assert.equal(JSON.stringify(res.body).includes(secret), false);
  verify({ user }, res);
  assert.equal(JSON.stringify(res.body).includes(secret), false);
});

test("unassigned/deleted seller employees are rejected at login and buyer/item list handlers", async () => {
  stub(User, "findOne", () => ({ populate: async () => ({ ...employee, sellerId: null }) }));
  stub(Seller, "findById", async () => null);
  const res = response();
  await login({ body: { email: "test", password: "test" } }, res);
  assert.equal(res.statusCode, 403);
  for (const handler of [getAllBuyers, getItems]) {
    const result = response();
    await handler({ user: { ...employee, sellerId: null } }, result);
    assert.equal(result.statusCode, 403);
  }
});

test("employee updates ignore seller reassignment and MongoDB update operators", async () => {
  let saved;
  stub(Buyer, "findById", async () => ({ sellerId, set(data) { saved = data; }, async save() { return saved; } }));
  const req = { user: employee, params: { id: otherId.toString() }, body: { buyerName: "Changed", sellerId: otherId, $set: { sellerId: otherId } } };
  await updateBuyer(req, response());
  assert.deepEqual(saved, { buyerName: "Changed" });
  stub(Item, "findById", async () => ({ sellerId }));
  stub(Item, "findByIdAndUpdate", async (_id, data) => { saved = data; return data; });
  await updateItem({ ...req, body: { itemName: "Changed", sellerId: otherId, $unset: { sellerId: "" } } }, response());
  assert.deepEqual(saved, { itemName: "Changed" });
});

test("other-seller records reject employee edits", async () => {
  for (const [model, handler] of [[Buyer, updateBuyer], [Item, updateItem]]) {
    stub(model, "findById", async () => ({ sellerId: otherId }));
    const res = response();
    await handler({ user: employee, params: { id: otherId.toString() }, body: {} }, res);
    assert.equal(res.statusCode, 403);
  }
});

test("profile password changes are hashed and remain usable for login", async () => {
  const user = { password: "old", async save() {}, toObject() { return { password: this.password }; } };
  stub(User, "findById", async () => user);
  const res = response();
  await updateProfile({ user: employee, body: { password: "replacement-password" } }, res);
  assert.equal(res.statusCode, 200);
  assert.notEqual(user.password, "replacement-password");
  assert.equal(await bcrypt.compare("replacement-password", user.password), true);
  assert.equal(res.body.user.password, undefined);
});

test("blank seller token preserves credential; replacement saves encrypted and never returns it", async () => {
  const encrypted = encryptToken(secret, context);
  const seller = Seller.hydrate({ _id: sellerId, sellerNTNCNIC: "1234567", sellerBusinessName: "Test", sellerProvince: "Sindh", sellerAddress: "Test", fbrToken: encrypted, hasFbrToken: true });
  stub(Seller, "findById", async () => seller);
  stub(Seller.collection, "updateOne", async () => ({ matchedCount: 1 }));
  stub(mongoose.model("AuditEvent"), "create", async () => ({}));
  const res = response();
  await updateSeller({ user: { ...employee, role: "admin" }, params: { id: sellerId }, body: { fbrToken: "" } }, res);
  assert.equal(seller.fbrToken, encrypted);
  await updateSeller({ user: { ...employee, role: "admin" }, params: { id: sellerId }, body: { fbrToken: "replacement-secret" } }, res);
  assert.equal(decryptToken(seller.fbrToken, context), "replacement-secret");
  assert.equal(JSON.stringify(res.body).includes("replacement-secret"), false);
});

test("invoice creation cannot forge publication status or upstream receipts", async () => {
  let data;
  stub(Invoice.prototype, "save", async function () { data = this.toObject(); return this; });
  const res = response();
  await createInvoice({ user: employee, body: { isPublished: true, fbrResponse: { fake: true }, publishedAt: new Date(), invoiceNumber: "fake", items: [] } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(data.isPublished, false);
  assert.equal(data.fbrResponse, null);
  assert.equal(data.invoiceNumber, undefined);
  assert.equal(invoiceRouter.stack.some((layer) => layer.route?.path?.includes("mark-published")), false);
});

test("publish decrypts server credential and preserves Exempt and optional unregistered NTN", async () => {
  const id = new mongoose.Types.ObjectId();
  const invoice = new Invoice({ _id: id, sellerId, invoiceType: "Sale Invoice", invoiceDate: "2026-10-31", sellerNTNCNIC: "1234567", sellerBusinessName: "Test", sellerProvince: "Sindh", sellerAddress: "Test", buyerNTNCNIC: "", buyerRegistrationType: "Unregistered", buyerBusinessName: "Buyer", buyerProvince: "Sindh", buyerAddress: "Test", items: [{ hsCode: "0102.2930", productDescription: "Test", rate: "Exempt", uoM: "Units", quantity: 1, totalValues: 10, valueSalesExcludingST: 10, salesTaxApplicable: 0, saleType: "Exempt goods" }] });
  await invoice.validate();
  stub(Invoice, "findById", async () => invoice);
  stub(invoice, "save", async () => invoice);
  stub(Seller, "findById", () => ({ select: async () => ({ _id: sellerId, isActive: true, fbrToken: encryptToken(secret, context) }) }));
  stub(mongoose.model("AuditEvent"), "create", async () => ({}));
  let calls = 0;
  stub(globalThis, "fetch", async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.items[0].rate, "Exempt");
    assert.equal(payload.buyerNTNCNIC, "");
    return { ok: true, status: 200, text: async () => JSON.stringify({ invoiceNumber: "test-receipt", validationResponse: { statusCode: "00", status: "Valid", invoiceStatuses: [{ statusCode: "00", status: "Valid" }] } }) };
  });
  const res = response();
  await publishInvoice({ user: employee, params: { id: id.toString() } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls, 2);
  assert.equal(invoice.isPublished, true);
  invoice.buyerRegistrationType = "Registered";
  await assert.rejects(invoice.validate(), /NTN\/CNIC/);
});

let server;
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });
test("authenticated reference proxy enforces seller scope, fixed destinations and no credential responses", async () => {
  let currentUser = employee;
  stub(User, "findById", () => ({ select() { return this; }, populate: async () => currentUser }));
  stub(Seller, "findById", () => {
    const seller = { _id: sellerId, isActive: true, fbrToken: encryptToken(secret, context) };
    return { then(resolve) { return Promise.resolve(seller).then(resolve); }, select: async () => seller };
  });
  let calls = 0;
  const app = express();
  app.use("/reference", createReferenceRouter({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://gw.fbr.gov.pk");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.redirect, "error");
    return { ok: true, json: async () => [{ stateProvinceDesc: "Sindh" }] };
  } }));
  server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/reference`;
  const headers = { Authorization: `Bearer ${jwt.sign({ _id: userId }, process.env.JWT_KEY)}` };
  assert.equal((await fetch(`${base}/provinces`)).status, 401);
  let result = await fetch(`${base}/provinces`, { headers });
  assert.equal(result.status, 200);
  const body = await result.text();
  assert.match(body, /Sindh/); assert.equal(body.includes(secret), false);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}/provinces?sellerId=${otherId}`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/provinces?url=https://evil.invalid`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/provinces?sellerId=a&sellerId=b`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/constructor`, { headers })).status, 404);
  currentUser = { ...employee, sellerId: null };
  assert.equal((await fetch(`${base}/provinces`, { headers })).status, 403);
  currentUser = { ...employee, role: "admin", sellerId: null };
  assert.equal((await fetch(`${base}/provinces?sellerId=${sellerId}`, { headers })).status, 200);
  assert.equal(calls, 2);
});
