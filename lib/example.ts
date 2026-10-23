import type { GraphResponse } from "@/types/diagram";

/** A small, realistic diagram so anyone can try select → speak → preview → apply → undo without generating first. */
export const EXAMPLE_NAME = "Example: Checkout architecture";

export const EXAMPLE_GRAPH: GraphResponse = {
  direction: "LR",
  nodes: [
    { id: "web", label: "Web App", color: "blue", icon: "react" },
    { id: "gateway", label: "API Gateway", color: "purple", icon: "nginx" },
    { id: "orders", label: "Orders Service", color: "green" },
    { id: "payments", label: "Payments Service", color: "green" },
    { id: "db", label: "Postgres", color: "teal", icon: "postgresql" },
    { id: "stripe", label: "Stripe", color: "orange", icon: "stripe" },
  ],
  edges: [
    { from: "web", to: "gateway", label: "HTTPS" },
    { from: "gateway", to: "orders" },
    { from: "gateway", to: "payments" },
    { from: "orders", to: "db", label: "SQL" },
    { from: "payments", to: "stripe" },
  ],
  groups: [],
};

/** Instructions that work well on the example; shown as suggestions after it opens. */
export const EXAMPLE_TRY = [
  "Add a queue for confirmation emails after the orders service",
  "Rename Postgres to Orders DB",
  "Put a Redis cache between the gateway and the orders service",
];
