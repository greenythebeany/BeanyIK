import { useEffect, useMemo, useState } from 'react';
import { LangContext, STRINGS, fill, initialLang } from './i18n.js';
import Icon from './components/Icon.jsx';

const REPO = 'https://github.com/greenythebeany/BeanyIK';
const BASE = import.meta.env.BASE_URL;

// the URDF samples bundled with the web version (website/app-samples).
// photos are freely licensed (Wikimedia Commons), cropped to 800x600 and kept
// in public/robots. robots without a free photo link to the maker instead
const SAMPLE_ROBOTS = [
  { file: 'kuka_iiwa', name: 'LBR iiwa', maker: 'KUKA', dof: 7,
    photo: {
      src: 'robots/kuka_iiwa.webp', by: 'DLR German Aerospace Center', license: 'CC BY 2.0',
      page: 'https://commons.wikimedia.org/wiki/File:Leichtbauroboter_-_Lightweight_robots_(14235555984).jpg',
    } },
  { file: 'franka_panda', name: 'Panda', maker: 'Franka Emika', dof: 7,
    photo: {
      src: 'robots/franka_panda.webp', by: 'Ims', license: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Franka_Emika1.jpg',
    } },
  { file: 'ur5', name: 'UR5', maker: 'Universal Robots', dof: 6,
    photo: {
      src: 'robots/ur5.webp', by: 'GrowSkills Robotics', license: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Cobot.jpg',
    } },
  { file: 'xarm6', name: 'xArm 6', maker: 'UFACTORY', dof: 6, link: 'https://www.ufactory.us/product/ufactory-xarm-6' },
  { file: 'kuka_lwr', name: 'LWR 4', maker: 'KUKA', dof: 7, link: 'https://qviro.com/product/kuka/lwr/specifications' },
];

function SamplePhoto({ robot, t }) {
  const [failed, setFailed] = useState(false);
  const p = robot.photo;
  if (!p || failed) {
    return (
      <div className="sample-photo none">
        <Icon name="chain" size={28} />
        <span>{t.web.noPhoto}</span>
        {robot.link && <a href={robot.link} target="_blank" rel="noopener noreferrer">{fill(t.web.seeMaker, { maker: robot.maker })}</a>}
      </div>
    );
  }
  return (
    <div className="sample-photo">
      <img src={`${BASE}${p.src}`} alt={`${robot.maker} ${robot.name}`} loading="lazy" width="800" height="600" onError={() => setFailed(true)} />
      <a className="sample-credit" href={p.page} target="_blank" rel="noopener noreferrer">
        {t.web.photo}: {p.by}, {p.license}
      </a>
    </div>
  );
}

const SHOTS = {
  light: [
    ['ik-analytic-en', 'Inverse kinematics, analytic branches'],
    ['chain-dh-en', 'Kinematic chain and DH table'],
    ['fixed-link-en', 'Link properties'],
    ['analytic-code-en', 'Analytic IK solver'],
    ['tabs-en', 'Tabs and joint controls'],
    ['home-en', 'Home screen'],
    ['shortcuts-en', 'Keyboard shortcuts'],
    ['about-en', 'About and credits'],
  ],
  dark: [
    ['dark-arm-en', 'Dark theme'],
    ['matrices-dark-en', 'Jacobian and workspace'],
    ['ik-analytic-sk', 'IK in dark theme'],
  ],
  sk: [
    ['home-sk', 'Domovská obrazovka'],
    ['scara-sk', 'SCARA a DH tabuľka'],
    ['matrices-sk', 'Matice a Jakobián'],
    ['ik-analytic-sk', 'Inverzná kinematika'],
  ],
};

// version baked in at build time, so the page never shows without one
const BUILD_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const CACHE_KEY = 'beanyik_site_release';

// file names follow the release workflow, so links work even without the api
function fallbackRelease(version) {
  const names = [
    `BeanyIK-Setup-${version}.exe`, `BeanyIK-Portable-${version}.exe`,
  ];
  return {
    version,
    url: `${REPO}/releases/tag/v${version}`,
    assets: Object.fromEntries(names.map((name) => [name, { name, size: 0, browser_download_url: `${REPO}/releases/download/v${version}/${name}` }])),
  };
}

const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// latest release from github, cached for a few minutes so we stay under the rate limit
function useRelease() {
  const [rel, setRel] = useState(() => (BUILD_VERSION ? fallbackRelease(BUILD_VERSION) : null));
  useEffect(() => {
    const apply = (r) => setRel((cur) => (!cur || !newer(cur.version, r.version) ? r : cur));
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) { apply(cached.rel); return; }
    } catch { /* no storage */ }
    fetch('https://api.github.com/repos/greenythebeany/BeanyIK/releases/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const r = {
          version: (j.tag_name || '').replace(/^v/, ''),
          url: j.html_url,
          assets: Object.fromEntries((j.assets || []).map((a) => [a.name, a])),
        };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rel: r })); } catch { /* fine */ }
        apply(r);
      })
      .catch(() => {});
  }, []);
  return rel;
}

function findAsset(rel, re) {
  if (!rel) return null;
  return Object.values(rel.assets).find((a) => re.test(a.name)) || null;
}

// fade sections in as they scroll into view
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}


function Section({ id, kicker, title, text, children, className = '' }) {
  return (
    <section id={id} className={`section ${className}`}>
      <div className="wrap">
        <div className="section-head reveal">
          {kicker && <div className="kicker">{kicker}</div>}
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function App() {
  const [lang, setLangState] = useState(initialLang);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState('light');
  const [lightbox, setLightbox] = useState(null);
  const rel = useRelease();
  const t = STRINGS[lang];
  useReveal();

  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem('beanyik_site_lang', l); } catch { /* fine */ }
  };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('beanyik_site_theme', theme); } catch { /* fine */ }
  }, [theme]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setup = findAsset(rel, /setup.*\.exe$/i);
  const portable = findAsset(rel, /portable.*\.exe$/i);
  const releasesUrl = rel?.url || `${REPO}/releases/latest`;
  const mb = (a) => (a?.size ? `${(a.size / 1048576).toFixed(0)} MB` : '');
  const nav = [['features', t.nav.features], ['demos', t.nav.demos], ['robots', t.nav.robots], ['screens', t.nav.screens], ['download', t.nav.download], ['faq', t.nav.faq]];
  const ctx = useMemo(() => ({ lang, t, setLang }), [lang, t]);

  return (
    <LangContext.Provider value={ctx}>
      <header className="appbar">
        <div className="appbar-inner">
          <a href="#top" className="brand" onClick={() => setMenuOpen(false)}>
            <img src={`${BASE}logo.png`} alt="" width="30" height="30" />
            <span>BeanyIK</span>
          </a>
          <nav className={`tabs ${menuOpen ? 'open' : ''}`}>
            {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="tab" onClick={() => setMenuOpen(false)}>{label}</a>)}
          </nav>
          <div className="appbar-right">
            <button className="lang-btn" onClick={() => setLang(lang === 'en' ? 'sk' : 'en')} title="Language / Jazyk">
              <Icon name="globe" size={18} />{lang.toUpperCase()}
            </button>
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t.themeLight : t.themeDark}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <a className="btn btn-primary hide-sm" href="#download"><Icon name="download" size={18} />{t.nav.download}</a>
            <button className="icon-btn show-sm" onClick={() => setMenuOpen(!menuOpen)} aria-label={t.menu}>
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy reveal">
              <div className="badge">{t.hero.badge}</div>
              <h1>{t.hero.title}</h1>
              <p>{t.hero.text}</p>
              <div className="hero-actions">
                <a className="btn btn-primary btn-lg" href={setup?.browser_download_url || releasesUrl}>
                  <Icon name="windows" size={18} />
                  {fill(t.hero.download, { os: 'Windows' })}
                </a>
                <a className="btn btn-lg web-only" href={`${BASE}app/`}><Icon name="play" size={18} />{t.hero.openWeb}</a>
                <a className="btn btn-lg" href={REPO}><Icon name="github" size={18} />{t.hero.github}</a>
              </div>
              <div className="hero-meta">
                {rel?.version && <span>{fill(t.hero.version, { v: rel.version })}</span>}
                <a href="#download">{t.hero.downloadAll}</a>
              </div>
            </div>
            <div className="window reveal">
              <div className="window-bar">
                <img src={`${BASE}logo.png`} alt="" width="16" height="16" />
                <span className="window-tab">6-DOF arm</span>
                <span className="window-dots"><i /><i /><i /></span>
              </div>
              <picture>
                <img className="window-shot" src={`${BASE}media/demo-arm6.webp`} alt="BeanyIK 6-DOF arm demo" width="960" height="697" />
              </picture>
            </div>
          </div>
          <div className="wrap stats reveal">
            {t.stats.map(([n, l]) => <div key={l} className="stat"><b>{n}</b><span>{l}</span></div>)}
          </div>
        </section>

        <Section id="features" kicker={t.features.kicker} title={t.features.title}>
          <div className="feature-grid">
            {t.features.items.map(([ic, color, title, text]) => (
              <div key={title} className="card feature reveal">
                <span className={`tile ${color}`}><Icon name={ic} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="demos" kicker={t.demos.kicker} title={t.demos.title} text={t.demos.text} className="alt">
          <div className="demo-grid">
            {t.demos.items.map(([id, title, text, tag]) => (
              <figure key={id} className="card demo reveal">
                <img src={`${BASE}media/demo-${id}.webp`} alt={title} loading="lazy" width="960" height="697" />
                <figcaption>
                  <div className="demo-title"><h3>{title}</h3><span className="pill">{tag}</span></div>
                  <p>{text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section id="robots" kicker={t.web.samplesKicker} title={t.web.samplesTitle} text={t.web.samplesText}>
          <div className="sample-grid">
            {SAMPLE_ROBOTS.map((r) => (
              <article key={r.file} className="card sample reveal">
                <SamplePhoto robot={r} t={t} />
                <div className="sample-body">
                  <span className="sample-maker">{r.maker}</span>
                  <h4>{r.name}</h4>
                  <div className="sample-specs"><span className="pill">{fill(t.web.joints, { n: r.dof })}</span></div>
                  <a className="btn" href={`${BASE}app/samples/${r.file}.urdf`} download><Icon name="download" size={16} />{t.web.download}</a>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="screens" kicker={t.screens.kicker} title={t.screens.title} className="alt">
          <div className="segmented reveal" role="tablist">
            {Object.entries(t.screens.tabs).map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>{label}</button>
            ))}
          </div>
          <div className="gallery">
            {SHOTS[tab].map(([file, alt]) => (
              <button key={`${tab}-${file}`} className="shot reveal in" onClick={() => setLightbox({ file, alt })}>
                <img src={`${BASE}shots/${file}.webp`} alt={alt} loading="lazy" width="1280" height="752" />
                <span>{alt}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section id="how" kicker={t.steps.kicker} title={t.steps.title}>
          <ol className="steps">
            {t.steps.items.map(([title, text], i) => (
              <li key={title} className="card reveal"><span className="step-n">{i + 1}</span><h3>{title}</h3><p>{text}</p></li>
            ))}
          </ol>
        </Section>

        <Section id="keys" kicker={t.shortcuts.kicker} title={t.shortcuts.title} className="alt">
          <div className="keys card reveal">
            {t.shortcuts.items.map(([k, d]) => (
              <div key={k} className="key-row">
                <span>{d}</span>
                <span className="kbds">{k.split(/\+(?=.)/).map((x, i) => <span key={i}>{i > 0 && <i>+</i>}<kbd>{x}</kbd></span>)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="download" kicker={t.download.kicker} title={t.download.title} text={t.download.text}>
          <div className="download-grid">
            <div className="card platform reveal">
              <div className="platform-head"><Icon name="windows" size={24} /><h3>{t.download.win}</h3></div>
              <a className="dl" href={setup?.browser_download_url || releasesUrl}>
                <div><b>{t.download.winSetup}</b><span>{t.download.winSetupHint}</span></div>
                <span className="dl-meta">{mb(setup)}<Icon name="download" size={18} /></span>
              </a>
              <a className="dl" href={portable?.browser_download_url || releasesUrl}>
                <div><b>{t.download.winPortable}</b><span>{t.download.winPortableHint}</span></div>
                <span className="dl-meta">{mb(portable)}<Icon name="download" size={18} /></span>
              </a>
            </div>
            <div className="card platform reveal">
              <div className="platform-head"><Icon name="play" size={24} /><h3>{t.download.web}</h3></div>
              <a className="dl web-only" href={`${BASE}app/`}>
                <div><b>{t.download.webOpen}</b><span>{t.download.webHint}</span></div>
                <span className="dl-meta"><Icon name="arrow" size={18} /></span>
              </a>
              <p className="phone-only">{t.web.phone}</p>
            </div>
          </div>
          <p className="note reveal">{t.download.smartscreen}</p>
          <div className="source reveal">
            <span>{t.download.source}</span>
            <code>git clone {REPO}.git && cd BeanyIK && npm install && npm start</code>
          </div>
        </Section>

        <Section id="faq" kicker={t.faq.kicker} title={t.faq.title} className="alt">
          <div className="faq">
            {t.faq.items.map(([q, a]) => (
              <details key={q} className="card reveal">
                <summary>{q}<Icon name="arrow" size={18} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Section>
      </main>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="brand"><img src={`${BASE}logo.png`} alt="" width="28" height="28" /><span>BeanyIK</span></div>
          <nav>
            <a href={`${REPO}#readme`}>{t.footer.readme}</a>
            <a href={`${REPO}/blob/main/${lang === 'sk' ? 'TERMS.sk.md' : 'TERMS.md'}`}>{t.footer.terms}</a>
            <a href={`${REPO}/blob/main/CREDITS.md`}>{t.footer.credits}</a>
            <a href={`${REPO}/blob/main/LICENSE`}>{t.footer.license}</a>
            <a href={REPO}><Icon name="github" size={16} />GitHub</a>
          </nav>
          <p className="fine">{t.footer.made} · {t.footer.logo}</p>
        </div>
      </footer>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={`${BASE}shots/${lightbox.file}.webp`} alt={lightbox.alt} />
          <button className="icon-btn" aria-label={t.screens.close}><Icon name="close" /></button>
        </div>
      )}
    </LangContext.Provider>
  );
}
