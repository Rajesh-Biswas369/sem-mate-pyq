import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Semester from "./pages/Semester";
import Subject from "./pages/Subject";
import PdfViewer from "./pages/PdfViewer";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/semester/:semesterName" element={<Semester />} />
        <Route path="/subject/:semesterName/:subjectName" element={<Subject />} />
        <Route path="/viewer/:semesterName/:subjectName/:paperIndex" element={<PdfViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;