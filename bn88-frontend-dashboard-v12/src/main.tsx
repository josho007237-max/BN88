// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

import App from "./App";
import Dashboard from "./pages/Dashboard";
import BotsPage from "./pages/Bots";
import BotDetail from "./pages/BotDetail";
import Login from "./pages/Login";
import ChatCenter from "./pages/ChatCenter";
import Knowledge from "./pages/Knowledge";
import MarketingLep from "./pages/MarketingLep";
import "./index.css";

// ใช้ key เดียวกับ lib/api.ts
const TOKEN_KEY = "bn9_jwt";

/* ------------------------ helpers ------------------------ */

function hasToken() {
  try {
    return !!localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

// ย้าย scrollTo(0,0) ไว้ตรงนี้ (ไม่เกี่ยวกับ loop)
function ScrollTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// ครอบเฉพาะ “หน้า private”
function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  if (!hasToken()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }
  return children;
}

function RouteError() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">เกิดข้อผิดพลาดของเส้นทาง</h2>
      <p className="text-sm text-neutral-500">
        ลองรีเฟรชหน้า หรือกลับไปหน้าแรก
      </p>
      <a href="/" className="text-indigo-500 underline">
        กลับหน้าแรก
      </a>
    </div>
  );
}

/* ------------------------ router ------------------------ */

const router = createBrowserRouter([
  // public: /login (ไม่ครอบ RequireAuth)
  {
    path: "/login",
    element: <Login />,
    errorElement: <RouteError />,
  },

  // shell + protected pages
  {
    path: "/",
    element: (
      <>
        <ScrollTop />
        <App />
      </>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        ),
      },
      {
        path: "dashboard",
        element: (
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        ),
      },
      {
        path: "bots",
        element: (
          <RequireAuth>
            <BotsPage />
          </RequireAuth>
        ),
      },
      {
        path: "bots/:botId",
        element: (
          <RequireAuth>
            <BotDetail />
          </RequireAuth>
        ),
      },
      {
        path: "chats",
        element: (
          <RequireAuth>
            <ChatCenter />
          </RequireAuth>
        ),
      },
      {
        path: "knowledge",
        element: (
          <RequireAuth>
            <Knowledge />
          </RequireAuth>
        ),
      },
      {
        path: "marketing-lep",
        element: (
          <RequireAuth>
            <MarketingLep />
          </RequireAuth>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function Root() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
