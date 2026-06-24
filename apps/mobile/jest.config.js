/** @type {import('jest').Config} */
module.exports = {
  roots: ["<rootDir>/src/__tests__"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
      "^@snapko/shared$": "<rootDir>/../../packages/shared/src/index.ts",
      "^@snapko/ts-types$": "<rootDir>/../../packages/ts-types/index.ts",
      "^expo-file-system$": "<rootDir>/src/__mocks__/expo-file-system.ts",
    },
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
