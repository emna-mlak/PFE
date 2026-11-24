import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "agent_token";
const AGENT_ID_KEY = "agent_id";
const AUTH_USER_ID_KEY = "auth_user_id";
const AGENT_PROFILE_KEY = "agent_profile";

async function getItem(key: string) {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  async get() {
    return getItem(TOKEN_KEY);
  },
  async set(value: string) {
    return setItem(TOKEN_KEY, value);
  },
  async clear() {
    return deleteItem(TOKEN_KEY);
  },
};

export const authStorage = {
  async setAgentId(value: string) {
    return setItem(AGENT_ID_KEY, value);
  },
  async getAgentId() {
    return getItem(AGENT_ID_KEY);
  },
  async setAuthUserId(value: string) {
    return setItem(AUTH_USER_ID_KEY, value);
  },
  async getAuthUserId() {
    return getItem(AUTH_USER_ID_KEY);
  },
  async clear() {
    await Promise.all([
      deleteItem(AGENT_ID_KEY),
      deleteItem(AUTH_USER_ID_KEY),
      deleteItem(TOKEN_KEY),
    ]);
  },
};

export const agentStorage = {
  async setProfile(value: string) {
    return setItem(AGENT_PROFILE_KEY, value);
  },
  async getProfile() {
    return getItem(AGENT_PROFILE_KEY);
  },
  async clearProfile() {
    return deleteItem(AGENT_PROFILE_KEY);
  },
};
