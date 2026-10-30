import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
export const isEncryptedToken = (value) => typeof value === "string" && value.startsWith(PREFIX);
export const tokenContext = (model, id, field) => `${model}:${id}:${field}`;

export const getTokenKey = () => {
  const value = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("Invalid TOKEN_ENCRYPTION_KEY");
  }
  return key;
};

export const encryptToken = (value, context) => {
  if (typeof value !== "string" || !value.trim()) throw new Error("Token is required");
  const token = value.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  if (!token) throw new Error("Token is required");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(":");
};

export const decryptToken = (value, context) => {
  if (!isEncryptedToken(value)) throw new Error("Token migration is required");
  try {
    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 3) throw new Error();
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", getTokenKey(), iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt stored token");
  }
};

// Default query exclusion plus serialization redaction protects populated and newly saved documents.
export const protectToken = (schema, { model, field, flag }) => {
  schema.pre("save", function () {
    if (this.isModified(field)) {
      this[field] = encryptToken(this[field], tokenContext(model, this._id, field));
      if (flag) this[flag] = true;
    }
  });
  for (const option of ["toJSON", "toObject"]) {
    schema.set(option, { transform(_doc, ret) { delete ret[field]; return ret; } });
  }
};
