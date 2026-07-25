/**
 * React admin shell (Phase 3) — mounts platform status badge; panels in admin.js use platform API.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { platformApi } from "../Tools/platform-api.js";

function AdminShell() {
  const [info, setInfo] = React.useState("Platform API connected");

  React.useEffect(() => {
    platformApi
      .adminMe()
      .then(() => setInfo("Admin session active · React shell ready for WebxRide merge"))
      .catch(() => setInfo(""));
  }, []);

  if (!info) return null;
  return (
    <div
      style={{
        padding: "0.5rem 1rem",
        fontSize: "0.8rem",
        color: "#9aa7b2",
        borderBottom: "1px solid #2a3544",
        background: "#1a2332",
      }}
    >
      {info}
    </div>
  );
}

const mount = document.getElementById("react-admin-root");
if (mount) {
  createRoot(mount).render(<AdminShell />);
}
