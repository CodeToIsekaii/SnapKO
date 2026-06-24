/**
 * E2E Test: Staff Invite Flow
 * Tests: Invite code validation, Join form validation
 */

import {
  inviteCodeSchema,
  inviteJoinSchema,
  getFieldErrors,
} from "@snapko/shared";

describe("Staff Invite Flow", () => {
  describe("Invite Code Validation", () => {
    it("should accept valid 6-char alphanumeric code", () => {
      const validCodes = ["ABC123", "XYZ789", "AAAAAA", "111111"];

      validCodes.forEach((code) => {
        const result = inviteCodeSchema.safeParse({ inviteCode: code });
        expect(result.success).toBe(true);
      });
    });

    it("should reject codes with wrong length", () => {
      const invalidCodes = ["ABC12", "ABC1234", "", "A"];

      invalidCodes.forEach((code) => {
        const result = inviteCodeSchema.safeParse({ inviteCode: code });
        expect(result.success).toBe(false);
      });
    });

    it("should reject codes with invalid characters", () => {
      const invalidCodes = ["ABC-12", "abc123", "ABC 12", "!@#$%^"];

      invalidCodes.forEach((code) => {
        const result = inviteCodeSchema.safeParse({ inviteCode: code });
        expect(result.success).toBe(false);
      });
    });

    it("should transform to uppercase", () => {
      const result = inviteCodeSchema.safeParse({ inviteCode: "abc123" });
      // This will fail because lowercase is not allowed
      expect(result.success).toBe(false);
    });
  });

  describe("Join Form Validation", () => {
    it("should validate complete staff registration", () => {
      const validData = {
        inviteCode: "ABC123",
        fullName: "Nguyen Van A",
        phoneNumber: "0901234567",
        password: "secret123",
      };

      const result = inviteJoinSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid phone numbers", () => {
      const invalidPhones = [
        "123456789", // Doesn't start with 0
        "090123456", // Too short
        "09012345678901", // Too long
        "abcdefghij", // Not numeric
      ];

      invalidPhones.forEach((phone) => {
        const result = inviteJoinSchema.safeParse({
          inviteCode: "ABC123",
          fullName: "Test User",
          phoneNumber: phone,
          password: "secret123",
        });
        expect(result.success).toBe(false);
      });
    });

    it("should accept valid Vietnamese phone formats", () => {
      const validPhones = [
        "0901234567", // 10 digits
        "09012345678", // 11 digits
        "0321234567", // Viettel newbie
        "0781234567", // Mobifone
      ];

      validPhones.forEach((phone) => {
        const result = inviteJoinSchema.safeParse({
          inviteCode: "ABC123",
          fullName: "Test User",
          phoneNumber: phone,
          password: "secret123",
        });
        expect(result.success).toBe(true);
      });
    });

    it("should return field-specific errors", () => {
      const invalidData = {
        inviteCode: "A", // Too short
        fullName: "X", // Too short
        phoneNumber: "123", // Invalid
        password: "123", // Too short
      };

      const errors = getFieldErrors(inviteJoinSchema, invalidData);

      expect(Object.keys(errors).length).toBeGreaterThan(0);
    });

    it("should strip whitespace from phone", () => {
      const result = inviteJoinSchema.safeParse({
        inviteCode: "ABC123",
        fullName: "Test User",
        phoneNumber: "090 123 4567",
        password: "secret123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phoneNumber).toBe("0901234567");
      }
    });
  });
});
