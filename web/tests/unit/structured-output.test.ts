import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toJsonSchema } from "@/lib/ai/client";
import { blueprintSchema } from "@/lib/ai/blueprint";
import { rubricMarkSchema } from "@/lib/ai/marker";
import { generatedGroupSchema } from "@/lib/ai/generate-question";

/**
 * Every stage sends its Zod schema to the endpoint as JSON Schema.
 *
 * The shapes that go wrong in practice are discriminated unions (which become
 * `anyOf`) and optional properties — services differ on both. These assert the
 * conversion produces something a service can actually act on, and that the
 * schemas the real stages depend on survive the round trip.
 */

describe("JSON Schema conversion", () => {
  it("converts a plain object schema", () => {
    const schema = toJsonSchema(
      z.object({ name: z.string(), count: z.number().int() }),
    );
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
      },
    });
  });

  it("marks only genuinely optional properties as optional", () => {
    const schema = toJsonSchema(
      z.object({ required: z.string(), optional: z.string().optional() }),
    ) as { required?: string[] };
    expect(schema.required).toEqual(["required"]);
  });

  it("expresses a discriminated union as a union the endpoint can follow", () => {
    const schema = toJsonSchema(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), a: z.string() }),
        z.object({ kind: z.literal("b"), b: z.number() }),
      ]),
    );
    const serialised = JSON.stringify(schema);
    expect(serialised).toMatch(/anyOf|oneOf/);
    expect(serialised).toContain('"a"');
    expect(serialised).toContain('"b"');
  });

  it("converts every schema the pipeline actually sends", () => {
    for (const [name, schema] of [
      ["blueprint", blueprintSchema],
      ["question group", generatedGroupSchema],
      ["rubric mark", rubricMarkSchema],
    ] as const) {
      const converted = toJsonSchema(schema);
      expect(converted, `${name} produced nothing`).toBeTruthy();
      expect(converted.type, `${name} is not an object schema`).toBe("object");
      // A schema an endpoint cannot read is worse than no schema at all.
      expect(() => JSON.stringify(converted)).not.toThrow();
    }
  });

  it("keeps the marking schema small enough to send with every response", () => {
    // Marking runs once per written response; an enormous schema would be paid
    // for on every one of them.
    const size = JSON.stringify(toJsonSchema(rubricMarkSchema)).length;
    expect(size).toBeLessThan(6000);
  });

  it("does not emit unresolvable references for recursive stimulus shapes", () => {
    const serialised = JSON.stringify(toJsonSchema(generatedGroupSchema));
    const refs = [...serialised.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      // Anything pointing outside the document cannot be resolved by a service.
      expect(ref?.startsWith("#")).toBe(true);
    }
  });
});
