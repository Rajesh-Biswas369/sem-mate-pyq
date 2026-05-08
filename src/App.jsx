import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Import Global Styles
import "./App.css";

// Import Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Semester from "./pages/Semester";
import Subject from "./pages/Subject";
import PdfViewer from "./pages/PdfViewer";

function App() {
  return (
    <Router>
      <Routes>
        {/* Main Landing Page */}
        <Route path="/" element={<Home />} />
        
        {/* Login Page */}
        <Route path="/login" element={<Login />} />
        
        {/* Shows list of subjects for a specific semester */}
        <Route path="/semester/:semesterName" element={<Semester />} />
        
        {/* Shows list of PYQ papers for a specific subject */}
        <Route path="/subject/:semesterName/:subjectName" element={<Subject />} />
        
        {/* The actual PDF rendering page */}
        <Route path="/viewer/:semesterName/:subjectName/:paperIndex" element={<PdfViewer />} />
      </Routes>
    </Router>
  );
}

export default App;