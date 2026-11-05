import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Me } from "../shared/types";
import { api } from "./api";

interface Session { me: Me | null; loading: boolean; dev: boolean; refresh: () => Promise<void> }
const Ctx = createContext<Session>({ me: null, loading: true, dev: false, refresh: async () => undefined });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [dev, setDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me | null; dev: boolean }>("/me");
      setMe(r.user);
      setDev(r.dev);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  return <Ctx.Provider value={{ me, loading, dev, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
