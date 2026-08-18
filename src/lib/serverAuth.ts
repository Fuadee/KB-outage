import type { User } from "@supabase/supabase-js";
import { AUTH_DISABLED } from "@/lib/authConfig";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

export type ServerAuthorization = {
  authorized: boolean;
  user: User | null;
};

export const authorizeServerRequest = async (): Promise<ServerAuthorization> => {
  if (AUTH_DISABLED) {
    return { authorized: true, user: null };
  }

  const { accessToken } = getAuthTokens();
  if (!accessToken) {
    return { authorized: false, user: null };
  }

  const authClient = createServerClient();
  const {
    data: { user },
    error
  } = await authClient.auth.getUser(accessToken);

  return {
    authorized: Boolean(user) && !error,
    user: error ? null : user
  };
};
