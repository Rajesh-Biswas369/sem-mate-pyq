import { updatesData } from "../data/updatesData";

function LatestUpdates() {
  return (
    <section className="updates-section">
      <div className="updates-header">
        <div>
          <p className="updates-eyebrow">Latest Activity</p>
          <h2>PYQ Updates</h2>
        </div>

        <span className="live-pill">
          <span></span>
          Live
        </span>
      </div>

      <div className="updates-timeline">
        {updatesData.map((update, index) => (
          <article className="update-card" key={`${update.title}-${index}`}>
            <div className="update-dot"></div>

            <div className="update-content">
              <div className="update-topline">
                <span className="update-tag">{update.tag}</span>
                <small>{update.date}</small>
              </div>

              <h3>{update.title}</h3>
              <p>{update.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default LatestUpdates;