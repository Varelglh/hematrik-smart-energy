import React, { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const outletContext = useMemo(() => ({ search, setSearch }), [search]);

  return (
    <div className="layout">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      <main className="content">
        <Topbar
          search={search}
          setSearch={setSearch}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <div className="page">
          <Outlet context={outletContext} />
        </div>
      </main>

      {sidebarOpen && <button className="backdrop" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} type="button" />}
    </div>
  );
}
