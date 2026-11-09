import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categoryV = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const conditionV = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const loanStatusV = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const automationKindV = v.union(
  v.literal("request_notification_sent"),
  v.literal("overdue_reminder_sent"),
);

export default defineSchema({
  users: defineTable({
    // Canonical identity key from the Clerk JWT (issuer + subject).
    tokenIdentifier: v.string(),
    email: v.string(), // server-side only, used for notifications
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryV,
    condition: conditionV,
    description: v.string(),
    deletedAt: v.optional(v.number()), // soft delete keeps loan history valid
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    ownerId: v.id("users"), // denormalized for the "incoming requests" view
    startDate: v.string(), // "YYYY-MM-DD", UTC
    endDate: v.string(),
    status: loanStatusV,
    returnedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_borrowerId", ["borrowerId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_toolId_and_status", ["toolId", "status"])
    .index("by_status_and_endDate", ["status", "endDate"]),

  // Convex -> n8n deliveries. One row per loan event; retried until sent or failed.
  outbox: defineTable({
    eventId: v.string(),
    payload: v.any(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status"]),

  // Written back by n8n. idempotencyKey makes retries safe.
  automationEvents: defineTable({
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    kind: automationKindV,
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loanId", ["loanId"]),

  // Written by the n8n error workflow so failed runs are visible in /admin.
  workflowErrors: defineTable({
    idempotencyKey: v.string(),
    workflowName: v.string(),
    executionId: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_idempotencyKey", ["idempotencyKey"]),
});
