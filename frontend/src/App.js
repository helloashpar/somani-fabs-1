import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/i18n";
import Landing from "@/pages/Landing";
import Display from "@/pages/Display";
import AdminApp from "@/admin/AdminApp";

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Toaster position="top-center" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={<AdminApp />} />
          <Route path="/d/:secret" element={<Display />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
