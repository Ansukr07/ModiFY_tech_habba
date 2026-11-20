import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Gate } from "./pages/Gate.jsx";
import { Login } from "./pages/Login.jsx";
import { OwnerApply } from "./pages/OwnerApply.jsx";
import { LenderQueue } from "./pages/LenderQueue.jsx";
import { LenderDesk } from "./pages/LenderDesk.jsx";

function Protected({ role, children }) {
  return sessionStorage.getItem("zerocibil-role") === role ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<Protected role="owner"><OwnerApply /></Protected>} />
        <Route path="/queue" element={<Protected role="lender"><LenderQueue /></Protected>} />
        <Route path="/application/:id" element={<Protected role="lender"><LenderDesk /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
