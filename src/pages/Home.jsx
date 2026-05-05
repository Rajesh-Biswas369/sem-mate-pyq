import LatestUpdates from "../components/LatestUpdates";
import Footer from "../components/Footer";
import { Link } from "react-router-dom";
import { pyqData } from "../data/pyqData";


function Home() {
  return (
    <div className="app electric-bg page-shell">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <header className="topbar electric-title">
        <h1>JU EE PYQ Solutions</h1>
        <p>Semester-wise previous year questions with detailed solutions</p>
      </header>

      <section className="hero glass-panel">
  <h2>Choose Your Semester</h2>
  <p>Select a semester and access subject-wise solved PDFs.</p>
</section>

<LatestUpdates />

<section className="grid semester-grid">
      <section className="grid semester-grid">
        {pyqData.map((sem) => (
          <Link
            to={`/semester/${encodeURIComponent(sem.semester)}`}
            className="electric-card semester-card"
            key={sem.semester}
          >
            <h3>{sem.semester}</h3>
            <p>{sem.subjects.length} subjects available</p>
            <span>Open →</span>
          </Link>
        ))}
      </section>
      <Footer />
    </div>
  );
}

export default Home;