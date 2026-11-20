import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Gate } from "./pages/Gate.jsx";
import { OwnerApply } from "./pages/OwnerApply.jsx";
import { OwnerStatus } from "./pages/OwnerStatus.jsx";
import { LenderQueue } from "./pages/LenderQueue.jsx";
import { LenderDesk } from "./pages/LenderDesk.jsx";
import { Evidence } from "./pages/Evidence.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route path="/apply" element={<OwnerApply />} />
        <Route path="/status/:id" element={<OwnerStatus />} />
        <Route path="/queue" element={<LenderQueue />} />
        <Route path="/application/:id" element={<LenderDesk />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
