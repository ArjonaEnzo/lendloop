import { describe, expect, test } from "vitest";
import errorHandler from "./workflows/error-handler.json";

type Node = { name: string; type: string; onError?: string };

describe("n8n error handler workflow", () => {
  // Review finding: if the original failure was Convex itself, "Record in LendLoop" fails too.
  // Without continue-on-error the workflow stops and the ops email is never sent.
  // Record and email must be attempted independently: either one alone still alerts someone.
  test("records in Convex and emails ops independently (each step continues on error)", () => {
    const nodes = errorHandler.nodes as Node[];
    for (const name of ["Record in LendLoop", "Email ops"]) {
      const node = nodes.find((n) => n.name === name);
      expect(node, name).toBeDefined();
      expect(node?.onError, name).toBe("continueRegularOutput");
    }
  });
});
