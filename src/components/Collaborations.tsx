import React from "react";
import { Icon } from "./Icon";

const featuredWebsite = {
  title: "Light Up Media & Signs",
  url: "https://www.lightupmediasigns.com/",
  description:
    "A creative business offering branding, graphic design, signage, and digital marketing services.",
};

function WebsitePreview() {
  return (
    <div
      className="collaboration-visual"
      role="img"
      aria-label="Flat illustrative browser preview for Light Up Media & Signs, not an actual screenshot"
    >
      <div className="collaboration-browser-frame">
        <div className="collaboration-browser-window">
          <div className="collaboration-browser-bar" aria-hidden="true">
            <span className="collaboration-browser-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="collaboration-browser-address">
              lightupmediasigns.com
            </span>
          </div>
          <div className="collaboration-website-art" aria-hidden="true">
            <div className="collaboration-website-nav">
              <strong>
                LIGHT UP
                <small>MEDIA &amp; SIGNS</small>
              </strong>
              <span>Home&nbsp; · &nbsp;Services&nbsp; · &nbsp;Contact</span>
            </div>
            <div className="collaboration-website-hero">
              <span className="collaboration-preview-kicker">
                BRANDING · SIGNS · MARKETING
              </span>
              <strong>
                Make your brand
                <br />
                <em>stand out.</em>
              </strong>
              <span className="collaboration-preview-subtitle">
                Creative solutions for businesses that want to be seen.
              </span>
              <span className="collaboration-preview-cta">
                Get a free estimate
              </span>
            </div>
            <div className="collaboration-website-accent" />
          </div>
        </div>
      </div>
      <span className="collaboration-preview-note">
        Illustrative website preview
      </span>
    </div>
  );
}

export function Collaborations() {
  return (
    <section
      id="Collaborations"
      className="section collaborations-section"
      aria-labelledby="collaborations-title"
      tabIndex={-1}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Featured / Collaborations &amp; ventures</p>
          <h2 id="collaborations-title">
            Building <span className="serif-accent">beyond</span>
            <br />
            boundaries.
          </h2>
        </div>
        <p>
          Creative business connections and
          <br className="desktop-break" /> independent ideas in progress.
        </p>
      </div>

      <article className="collaboration-feature">
        <WebsitePreview />
        <div className="collaboration-content">
          <p className="collaboration-overline">Business collaboration</p>
          <h3>{featuredWebsite.title}</h3>
          <p className="collaboration-description">
            {featuredWebsite.description}
          </p>
          <p className="collaboration-external-note">
            Independent external website · Opens in a new tab
          </p>
          <a
            className="collaboration-visit"
            href={featuredWebsite.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore website <Icon name="arrow" size={16} />
          </a>
        </div>
      </article>

      <div className="collaboration-upcoming">
        <div className="collaboration-upcoming-mark" aria-hidden="true">
          <Icon name="work" size={23} />
        </div>
        <div>
          <h3>Independent digital venture</h3>
          <p>A future standalone website with its own identity and features.</p>
        </div>
        <span className="collaboration-planned">Planned</span>
      </div>
    </section>
  );
}
