import { useState, useCallback } from "react";
import { useAuth } from "../../../contexts/AuthContext";

interface GoogleAuthState {
  isLoading: boolean;
  error: string | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
}

interface UseGoogleAuthReturn {
  state: GoogleAuthState;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useGoogleAuth(): UseGoogleAuthReturn {
  const { signInWithGoogle: authSignInWithGoogle, signOut: authSignOut } =
    useAuth();
  const [state, setState] = useState<GoogleAuthState>({
    isLoading: false,
    error: null,
    user: null,
  });

  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await authSignInWithGoogle();
      setState({ isLoading: false, error: null, user: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Đăng nhập Google thất bại";
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw new Error(message);
    }
  }, [authSignInWithGoogle]);

  const signOut = useCallback(async () => {
    await authSignOut();
    setState({
      isLoading: false,
      error: null,
      user: null,
    });
  }, [authSignOut]);

  return {
    state,
    signInWithGoogle,
    signOut,
  };
}
