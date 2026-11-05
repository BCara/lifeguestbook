import { AddMemory } from "./pages/AddMemory";
import { Create } from "./pages/Create";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Invite } from "./pages/Invite";
import { Manage } from "./pages/Manage";
import { MemorialPage } from "./pages/Memorial";
import { Print } from "./pages/Print";
import { SignIn } from "./pages/SignIn";
import { Wall } from "./pages/Wall";
import { useLocation } from "./router";

export function App() {
  const { path } = useLocation();
  let match: RegExpMatchArray | null;
  if (path === "/" || path === "") return <Home />;
  if (path === "/signin") return <SignIn />;
  if (path === "/dashboard") return <Dashboard />;
  if (path === "/new") return <Create />;
  if (path === "/invite") return <Invite />;
  if (path === "/wall") return <Wall />;
  if ((match = path.match(/^\/dashboard\/([\w-]+)\/print$/))) return <Print id={match[1]} />;
  if ((match = path.match(/^\/dashboard\/([\w-]+)$/))) return <Manage id={match[1]} />;
  if ((match = path.match(/^\/m\/([\w-]+)\/add$/))) return <AddMemory slug={match[1]} />;
  if ((match = path.match(/^\/m\/([\w-]+)$/))) return <MemorialPage slug={match[1]} />;
  return (
    <main className="narrow">
      <h1>Page not found</h1>
      <a href="/">Go home</a>
    </main>
  );
}
