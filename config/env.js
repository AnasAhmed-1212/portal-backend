const cleanEnvValue = (rawValue) => {
  if (rawValue === undefined || rawValue === null) return "";

  let value = String(rawValue).trim();

  // Support copy-pasted shell style values like KEY="value";
  if (value.endsWith(";")) {
    value = value.slice(0, -1).trim();
  }

  // Accept values that were copied with one or both surrounding quotes.
  if (value.startsWith('"') || value.startsWith("'")) {
    value = value.slice(1).trim();
  }
  if (value.endsWith('"') || value.endsWith("'")) {
    value = value.slice(0, -1).trim();
  }

  return value;
};

const env = {};

Object.defineProperties(env, {
  mongoUrl: {
    enumerable: true,
    get() {
      return cleanEnvValue(process.env.MONGO_URL || process.env.MONGODB_URI);
    },
  },
  jwtKey: {
    enumerable: true,
    get() {
      return cleanEnvValue(process.env.JWT_KEY);
    },
  },
});

const assertMongoEnv = () => {
  if (!env.mongoUrl) {
    throw new Error(
      "Missing required environment variable: MONGO_URL (or MONGODB_URI)"
    );
  }
};

const assertJwtEnv = () => {
  if (!env.jwtKey) {
    throw new Error("Missing required environment variable: JWT_KEY");
  }
};

export { cleanEnvValue, env, assertMongoEnv, assertJwtEnv };
