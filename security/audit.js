import mongoose from "mongoose";

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true });
const AuditEvent = mongoose.model("AuditEvent", schema);
// Only identifiers and fixed action names are retained, never payloads or credentials.
export const audit = async (req, action, resourceId) => {
  const event = { actorId: req.user._id, action, resourceId };
  try {
    await AuditEvent.create(event);
  } catch {
    // Preserve external-operation state even when audit storage is temporarily unavailable.
    console.error("Audit storage unavailable", JSON.stringify(event));
  }
};
