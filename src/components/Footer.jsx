function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-card">
        <h2>SEM-MATE</h2>

        <div className="footer-grid">
          <div>
            <h3>Contact</h3>
            <p>
              <a href="mailto:rajeshbiswas0510@gmail.com">
                rajeshbiswas0510@gmail.com
              </a>
            </p>
          </div>

          <div>
            <h3>Refund Policy</h3>
            <p>Digital content once unlocked is non-refundable.</p>
          </div>

          <div>
            <h3>About</h3>
            <p>SEM-MATE provides educational PYQ solutions for students.</p>
          </div>

          <div>
            <h3>Terms</h3>
            <p>Content is for personal study use only.</p>
          </div>
        </div>

        <p className="footer-bottom">
          © {new Date().getFullYear()} SEM-MATE. Educational digital content platform.
        </p>
      </div>
    </footer>
  );
}

export default Footer;