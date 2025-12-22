/**
 * E2E Test: Authentication Flow
 * Tests: Login, Register, Logout
 */

import { loginSchema, registerSchema, getFirstError } from "@snapko/shared";

describe("Authentication Flow", () => {
  describe("Login Validation", () => {
    it("should validate correct login credentials", () => {
      const validData = {
        email: "owner@test.com",
        password: "password123",
      };

      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const invalidData = {
        email: "invalid-email",
        password: "password123",
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject short password", () => {
      const invalidData = {
        email: "owner@test.com",
        password: "123",
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      const error = getFirstError(loginSchema, invalidData);
      expect(error).toContain("tối thiểu");
    });

    it("should transform email to lowercase", () => {
      const data = {
        email: "OWNER@TEST.COM",
        password: "password123",
      };

      const result = loginSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("owner@test.com");
      }
    });
  });

  describe("Register Validation", () => {
    it("should validate matching passwords", () => {
      const validData = {
        email: "new@test.com",
        password: "password123",
        confirmPassword: "password123",
        businessName: "Test Cafe",
      };

      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject mismatched passwords", () => {
      const invalidData = {
        email: "new@test.com",
        password: "password123",
        confirmPassword: "different",
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
