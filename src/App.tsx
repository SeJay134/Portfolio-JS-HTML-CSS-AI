import React from "react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Drawer, sections, type SectionId } from "./components/Drawer";
import { Projects } from "./components/Projects";
import { Contact } from "./components/Contact";
import { Icon } from "./components/Icon";
import { WidgetBoundary } from "./components/WidgetBoundary";
import { readPreference, savePreference } from "./lib/preferences";
import { useTheme } from "./hooks/useTheme";
const Chat = lazy(() => import("./components/Chat"));
const Constellation = lazy(() => import("./components/Constellation"));

function getViewportSection(): SectionId {
  const headerBottom =
    document
      .querySelector<HTMLElement>(".site-header")
      ?.getBoundingClientRect().bottom ?? 0;
  const marker = headerBottom + 32;
  let current: SectionId = sections[0][0];
  let nearestBelow: { id: SectionId; top: number } | undefined;

  for (const [id] of sections) {
    const section = document.getElementById(id);
    if (!section) continue;
    const rect = section.getBoundingClientRect();

    if (rect.top <= marker && rect.bottom > marker) {
      current = id;
      nearestBelow = undefined;
      break;
    }

    if (
      rect.top > marker &&
      rect.top < window.innerHeight &&
      (!nearestBelow || rect.top < nearestBelow.top)
    ) {
      nearestBelow = { id, top: rect.top };
    }

    if (rect.top <= marker) current = id;
  }

  if (nearestBelow) current = nearestBelow.id;

  const atDocumentEnd =
    Math.ceil(window.scrollY + window.innerHeight) >=
    document.documentElement.scrollHeight - 2;
  if (atDocumentEnd) current = sections[sections.length - 1][0];

  return current;
}

const skills = [
  {
    number: "01",
    name: "Web development",
    text: "Interfaces that connect people and information.",
    items: ["JavaScript", "HTML & CSS", "APIs", "Git"],
    exampleHref: "?category=Web#Projects",
    exampleLabel: "Web",
  },
  {
    number: "02",
    name: "Python & data",
    text: "From raw datasets to useful insights.",
    items: ["Python", "SQL", "Pandas", "NumPy", "ETL", "Azure"],
    exampleHref: "?category=Data#Projects",
    exampleLabel: "Data",
  },
  {
    number: "03",
    name: "Applied AI",
    text: "Exploring what intelligent software can do.",
    items: ["Machine learning", "scikit-learn", "LLMs", "RAG", "AI agents"],
    exampleHref: "?category=AI#Projects",
    exampleLabel: "AI",
  },
];
export default function App() {
  const [menu, setMenu] = useState(false),
    [chat, setChat] = useState(false),
    [chatLoaded, setChatLoaded] = useState(false);
  const { theme, selectTheme } = useTheme();
  const [effects, setEffects] = useState(false),
    [reduced, setReduced] = useState(true);
  const [active, setActive] = useState<(typeof sections)[number][0]>("Home");
  const pendingMenuNavigation = useRef<
    (typeof sections)[number][0] | null
  >(null);
  const menuOpenRef = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null),
    chatButton = useRef<HTMLButtonElement>(null);
  const disableEffects = useCallback(() => setEffects(false), []);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    // Effects are opt-in so the first visit stays lightweight on every device.
    setEffects(readPreference("portfolio-effects", "off") === "on");
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    let frame = 0;
    const syncActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (menuOpenRef.current) return;
        const current = getViewportSection();
        setActive((previous) => (previous === current ? previous : current));
      });
    };

    syncActiveSection();
    window.addEventListener("scroll", syncActiveSection, { passive: true });
    window.addEventListener("resize", syncActiveSection);
    window.addEventListener("hashchange", syncActiveSection);
    window.addEventListener("popstate", syncActiveSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncActiveSection);
      window.removeEventListener("resize", syncActiveSection);
      window.removeEventListener("hashchange", syncActiveSection);
      window.removeEventListener("popstate", syncActiveSection);
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const syncHashTarget = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (!id) return;
        document.getElementById(id)?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
      });
    };

    window.addEventListener("popstate", syncHashTarget);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", syncHashTarget);
    };
  }, []);

  useEffect(() => {
    const mq = matchMedia("(max-width: 600px)");
    const previous = document.body.style.overflow;
    const sync = () => {
      document.body.style.overflow =
        menu || (chat && mq.matches) ? "hidden" : previous;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      document.body.style.overflow = previous;
    };
  }, [menu, chat]);
  const prepareMenuOpen = useCallback(() => {
    const focused = document.activeElement;
    const focusedSection = sections.find(([id]) => focused?.id === id)?.[0];
    if (focusedSection) setActive(focusedSection);
    menuOpenRef.current = true;
  }, []);
  const openMenuFromChat = useCallback(() => {
    setChat(false);
    requestAnimationFrame(() => {
      if (!menuOpenRef.current) prepareMenuOpen();
      setMenu(true);
    });
  }, [prepareMenuOpen]);
  const closeMenu = useCallback((reason: "dismiss" | "navigate") => {
    menuOpenRef.current = false;
    setMenu(false);
    if (reason === "dismiss") {
      requestAnimationFrame(() =>
        menuButton.current?.focus({ preventScroll: true }),
      );
    }
  }, []);
  const navigateFromMenu = useCallback(
    (id: (typeof sections)[number][0]) => {
      pendingMenuNavigation.current = id;
      setActive(id);
    },
    [],
  );
  useEffect(() => {
    if (menu) return;
    const id = pendingMenuNavigation.current;
    if (!id) return;
    pendingMenuNavigation.current = null;

    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;

      const hash = `#${id}`;
      if (window.location.hash !== hash) {
        const url = new URL(window.location.href);
        url.hash = id;
        window.history.pushState(null, "", url);
      }
      target.scrollIntoView({ block: "start", behavior: "instant" });
      setActive(id);
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [menu]);
  const closeChat = useCallback(() => {
    setChat(false);
    requestAnimationFrame(() => chatButton.current?.focus());
  }, []);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <button
              ref={menuButton}
              className="menu-button"
              aria-expanded={menu}
              aria-controls="navigation-drawer"
              aria-label={chat ? "Main menu (assistant open)" : undefined}
              onPointerDown={prepareMenuOpen}
              onClick={() => {
                if (!menuOpenRef.current) prepareMenuOpen();
                setChat(false);
                setMenu(true);
              }}
            >
              <Icon name="menu" />
              <span>Menu</span>
            </button>
            <a
              className="wordmark"
              href="#Home"
              aria-label="Sergei Patrushev, home"
            >
              SP<span>.</span>
            </a>
          </div>
          <span className="header-caption">Software developer / Data & AI</span>
          <div className="header-actions">
            <label className="sr-only" htmlFor="theme">
              Color theme
            </label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => {
                selectTheme(e.target.value);
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <a href="#Connect" className="header-contact">
              Let's talk <Icon name="arrow" size={16} />
            </a>
          </div>
        </div>
      </header>
      <Drawer
        open={menu}
        onClose={closeMenu}
        onNavigate={navigateFromMenu}
        active={active}
      />
      <main id="main" tabIndex={-1}>
        <section id="Home" tabIndex={-1} className="hero section">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> Curiosity meets code
            </p>
            <h1>
              Hi, I'm Sergei.
              <br />I build <span className="serif-accent">useful</span>
              <br />
              digital things<span className="accent">.</span>
            </h1>
            <p className="hero-description">
              Software developer exploring the space between
              <br className="desktop-break" /> web applications, data, and
              artificial intelligence.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#Projects">
                Explore my work <Icon name="arrow" />
              </a>
              <a className="button secondary" href="#Connect">
                Get in touch
              </a>
            </div>
            <div className="hero-bottom">
              <span>Python</span>
              <span>JavaScript</span>
              <span>Data & AI</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
            <div className="portrait-frame">
              <img
                src="/images/portrait.webp"
                alt="Sergei Patrushev"
                width="640"
                height="714"
                fetchPriority="high"
              />
              <div className="portrait-caption">
                <span>Sergei Patrushev</span>
                <span>Always learning. Always building.</span>
              </div>
            </div>
            <span className="floating-label label-top">
              <span className="tiny-square" /> From idea to implementation
            </span>
            <span className="floating-label label-bottom">
              <Icon name="spark" size={16} /> Human curiosity. Technical craft.
            </span>
            {effects && !reduced && (
              <WidgetBoundary fallback={null}>
                <Suspense fallback={null}>
                  <Constellation onFailure={disableEffects} />
                </Suspense>
              </WidgetBoundary>
            )}
            <button
              className="effects-toggle"
              aria-pressed={effects && !reduced}
              disabled={reduced}
              onClick={() => {
                const value = !effects;
                setEffects(value);
                savePreference("portfolio-effects", value ? "on" : "off");
              }}
            >
              {reduced
                ? "Motion reduced"
                : `3D effects ${effects ? "on" : "off"}`}
            </button>
          </div>
        </section>
        <div className="intro-strip">
          <p>
            Thoughtful interfaces.<span>Meaningful data.</span>
            <span>Practical AI.</span>
          </p>
          <a href="#Projects" aria-label="Scroll to selected projects">
            ↓
          </a>
        </div>
        <Projects />
        <section id="Skills" tabIndex={-1} className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / What I work with</p>
              <h2>A connected toolkit.</h2>
            </div>
            <p>
              Different tools. One goal:
              <br />
              turning an idea into something useful.
            </p>
          </div>
          <div className="skill-grid">
            {skills.map((s) => (
              <article className="skill-card" key={s.name}>
                <span className="skill-number">{s.number}</span>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <ul className="tags">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <a className="text-link skill-project-link" href={s.exampleHref}>
                  See {s.exampleLabel} case studies <Icon name="arrow" size={14} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section
          id="Experience"
          tabIndex={-1}
          className="section experience-section"
        >
          <div>
            <p className="eyebrow">03 / The journey so far</p>
            <h2>
              Experience
              <br />
              that connects.
            </h2>
            <p className="section-intro">
              A background in technology, quality,
              <br />
              and helping others learn.
            </p>
          </div>
          <div className="timeline">
            <article>
              <p className="timeline-date">January 2026 — Present</p>
              <h3>Volunteer Mentor Reviewer</h3>
              <p className="company">Code the Dream</p>
              <p>
                Supporting aspiring developers with programming fundamentals,
                code reviews, debugging, and project work.
              </p>
              <span className="timeline-tag">Mentorship / Software</span>
            </article>
            <article>
              <p className="timeline-date">July 2024 — Present</p>
              <h3>Quality Technician</h3>
              <p className="company">Inteplast AmmTop</p>
              <p>
                Monitoring product quality, recording deviations, preparing
                reports, and helping teams resolve production issues.
              </p>
              <span className="timeline-tag">Quality / Problem solving</span>
            </article>
            <article>
              <p className="timeline-date">December 2022 — July 2024</p>
              <h3>IT Technician</h3>
              <p className="company">Computer World</p>
              <p>
                Building and repairing PCs, upgrading laptops, diagnosing
                hardware and software, and helping customers find practical
                solutions.
              </p>
              <span className="timeline-tag">Technology / Support</span>
            </article>
          </div>
        </section>
        <section id="About" tabIndex={-1} className="section about-section">
          <p className="eyebrow">04 / A little about me</p>
          <h2>
            Analytical by nature.
            <br />
            <span className="serif-accent">Curious</span> by choice.
          </h2>
          <div>
            <p>
              I'm Sergei Patrushev, an entry-level software developer with
              hands-on projects in full-stack web development, Python, data
              analysis, and AI applications.
            </p>
            <p>
              I enjoy connecting the pieces: a clear interface, reliable logic,
              and data that tells a useful story. My work spans responsive
              applications, data pipelines, machine learning models, and
              AI-powered tools.
            </p>
            <a className="text-link" href="#Projects">
              See that approach in action <Icon name="arrow" />
            </a>
          </div>
        </section>
        <Contact />
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="#Home" aria-label="Back to top">
          SP<span>.</span>
        </a>
        <p>© {new Date().getFullYear()} Sergei Patrushev</p>
        <a href="#Home">Back to top ↑</a>
      </footer>
      <button
        ref={chatButton}
        className="chat-launcher"
        aria-expanded={chat}
        aria-label={
          chat ? "Close portfolio assistant" : "Open portfolio assistant"
        }
        onClick={() => {
          if (chat) closeChat();
          else {
            setChatLoaded(true);
            setChat(true);
          }
        }}
      >
        <Icon name={chat ? "close" : "chat"} />
        <span>Ask about me</span>
      </button>
      {chatLoaded && (
        <WidgetBoundary
          fallback={
            <div className="widget-fallback">
              Assistant could not load. <a href="#Connect">Use Contact</a>.
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="widget-fallback" role="status">
                Opening assistant…
              </div>
            }
          >
            <Chat
              open={chat}
              onClose={closeChat}
              onOpenMenu={openMenuFromChat}
            />
          </Suspense>
        </WidgetBoundary>
      )}
    </>
  );
}
