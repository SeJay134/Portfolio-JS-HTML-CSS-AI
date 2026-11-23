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
      aria-label="Illustrative browser preview of the Light Up Media and Signs homepage. This concept is not a live website screenshot."
    >
      <div className="collaboration-browser-frame" aria-hidden="true">
        <div className="collaboration-browser-window">
          <div className="collaboration-browser-bar">
            <span className="collaboration-browser-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="collaboration-browser-address">
              lightupmediasigns.com
            </span>
          </div>
          <div className="collaboration-homepage">
            <div className="collaboration-homepage-nav">
              <strong className="collaboration-homepage-logo">
                LIGHT UP <small>MEDIA &amp; SIGNS LLC</small>
              </strong>
              <span>Home&nbsp; · &nbsp;Services&nbsp; · &nbsp;About Us&nbsp; · &nbsp;Testimonials&nbsp; · &nbsp;Contact</span>
            </div>
            <div className="collaboration-homepage-hero">
              <img
                className="collaboration-homepage-building"
                src="/images/lightup-building-concept.webp"
                width="192"
                height="121"
                alt=""
                decoding="async"
                loading="lazy"
              />
              <div className="collaboration-homepage-hero-copy">
                <strong>
                  Welcome to the place where your brand
                  <span> makes a difference.</span>
                </strong>
                <p>
                  Helping businesses stand out, look professional,
                  and attract attention.
                </p>
                <div className="collaboration-homepage-cta">
                  <span>Call Now</span>
                  <span>Get a Free Estimate</span>
                </div>
              </div>
            </div>
            <div className="collaboration-homepage-stats">
              <span><strong>20+</strong>Years of experience</span>
              <span><strong>1,900+</strong>Satisfied clients</span>
              <span><strong>700+</strong>Projects completed</span>
              <span><strong>350+</strong>Vehicles branded</span>
            </div>
            <div className="collaboration-homepage-services">
              <strong>OUR CORE SERVICES</strong>
              <div>
                <span>Branding &amp;<br />Graphic Design</span>
                <span>Digital Presence &amp;<br />Marketing</span>
                <span>Signs &amp;<br />Visual Advertising</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="collaboration-preview-note">
        Illustrative homepage concept · not a live screenshot
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
            className="collaboration-details"
            href="/collaborations/light-up-media-signs/"
          >
            Read about the collaboration <Icon name="arrow" size={16} />
          </a>
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
