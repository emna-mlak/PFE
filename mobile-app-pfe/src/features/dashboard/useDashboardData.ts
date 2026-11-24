import { useEffect, useState } from "react";

import { authStorage } from "../../lib/storage";
import { useCurrentAgent } from "../../services/convex/api";

export const useDashboardData = () => {
  const [authUserId, setAuthUserId] = useState("");

  useEffect(() => {
    authStorage.getAuthUserId().then((value) => {
      if (value) setAuthUserId(value);
    });
  }, []);

  return useCurrentAgent(authUserId);
};
