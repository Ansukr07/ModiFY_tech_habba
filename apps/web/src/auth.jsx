import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./data/api.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { api("/me").then(({ user }) => setUser(user)).catch(() => setUser(null)).finally(() => setReady(true)); }, []);
  const login = async (email) => {
    const { user } = await api("/auth/login", { method: "POST", body: JSON.stringify({ email }) });
    setUser(user);
    return user;
  };
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); }
  };
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}
