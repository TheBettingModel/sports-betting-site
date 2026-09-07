import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import legalRouter from "./legal";

const app = express();
app.use("/api", legalRouter);

describe("legal routes", () => {
  it("serves the public Terms of Use with every required policy section", async () => {
    const response = await request(app).get("/api/terms");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html;/);
    expect(response.text).toContain("<title>Terms of Use");
    expect(response.text).toContain("Informational Purpose Only");
    expect(response.text).toContain("real-money wagers");
    expect(response.text).toContain("at least 18 years of age");
    expect(response.text).toContain("Subscriptions and Billing");
    expect(response.text).toContain("Cancellation");
    expect(response.text).toContain("Governing Law");
  });
});