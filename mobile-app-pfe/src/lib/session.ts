import { useEffect, useState } from "react";

import { authStorage } from "./storage";

export function useAgentId() {
  const [agentId, setAgentId] = useState("");

  useEffect(() => {
    authStorage.getAgentId().then((value) => {
      if (value) setAgentId(value);
    });
  }, []);

  return agentId;
}
