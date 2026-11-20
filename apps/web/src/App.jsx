import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import { Gate } from "./pages/Gate.jsx";
import { Login } from "./pages/Login.jsx";
import { OwnerApply, OwnerDashboard } from "./pages/OwnerApply.jsx";
import { LenderDesk } from "./pages/LenderDesk.jsx";
import { BankDashboard } from "./pages/BankDashboard.jsx";
import { Skeleton, SkeletonBlock } from "./components/Skeleton.jsx";

function Protected({ role, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <SkeletonBlock className="auth-loading" label="Checking your session"><Skeleton className="auth-loading-line" /></SkeletonBlock>;
  return user?.role === role ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

export default function App() {
  return (
    <BrowserRouter><AuthProvider>
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<Protected role="owner"><OwnerApply /></Protected>} />
        <Route path="/owner" element={<Protected role="owner"><OwnerDashboard /></Protected>} />
        <Route path="/owner/application/:id" element={<Protected role="owner"><OwnerDashboard /></Protected>} />
        <Route path="/queue" element={<Protected role="lender"><LenderDesk /></Protected>} />
        <Route path="/application/:id" element={<Protected role="lender"><LenderDesk /></Protected>} />
        <Route path="/application/:id/:section" element={<Protected role="lender"><LenderDesk /></Protected>} />
        <Route path="/dashboard" element={<Protected role="lender"><LenderDesk /></Protected>} />
        <Route path="/bank" element={<Protected role="bank_admin"><BankDashboard /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider></BrowserRouter>
  );
}
