// src/features/auth/index.ts - Barrel export
export { AuthService } from "./services/auth.service";
export { useAuth } from "./hooks/useAuth";
export type {
  AuthUser,
  LoginResult,
  ProfileData,
} from "./services/auth.service";
