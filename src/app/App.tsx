import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { BrandMark, IconCode, IconHome, IconMenu, IconMoon, IconShield, IconSun, IconTable } from '../shared/icons';
import { readRaw, writeRaw } from '../shared/storage';
import { ToastProvider } from '../shared/Toast';
import { Landing } from './Landing';
import { ROUTES } from './routes';

const OccPage = lazy(() => import('../features/occ/OccPage'));
const ImpexPage = lazy(() => import('../features/impex/ImpexPage'));

const TITLES: Record<string, string> = { '/': 'SAP Commerce Code Generator', [ROUTES.occ]: 'OCC Controller Generator & Tester', [ROUTES.impex]: 'ImpEx Generator' };

type Theme = 'light' | 'dark' | 'system';

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const r = readRaw('theme');
    return r.ok && (r.value === 'light' || r.value === 'dark') ? r.value : 'system';
  });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    setTheme(next);
    writeRaw('theme', next);
  };
  return { dark, toggle };
}

function Shell() {
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    const known = TITLES[loc.pathname];
    document.title = known ? (loc.pathname === '/' ? known : `${known} · SAP Commerce Code Generator`) : 'Not found · SAP Commerce Code Generator';
    // remember last tool for convenience
    if (loc.pathname === ROUTES.occ || loc.pathname === ROUTES.impex) writeRaw('lastTool', loc.pathname);
  }, [loc.pathname]);
  const home = loc.pathname === '/';
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="SAP Commerce Code Generator – home">
          <BrandMark />
          <span>Commerce Code Generator</span>
        </Link>
        <nav className={`nav${open ? ' open' : ''}`} aria-label="Main">
          <NavLink to="/" end><IconHome />Home</NavLink>
          <NavLink to={ROUTES.occ}><IconCode />OCC Controller</NavLink>
          <NavLink to={ROUTES.impex}><IconTable />ImpEx</NavLink>
        </nav>
        <div className="topbar-right">
          <span className="privacy-pill" title="All processing happens in your browser. Nothing is uploaded."><IconShield /><span><span className="long">Runs locally · </span>no uploads</span></span>
          <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <IconSun /> : <IconMoon />}</button>
          <button type="button" className="icon-btn menu-toggle" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}><IconMenu /></button>
        </div>
      </header>
      <main id="main" className="main">
        <Suspense fallback={<p className="pad muted" role="status">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path={ROUTES.occ} element={<OccPage />} />
            <Route path={ROUTES.impex} element={<ImpexPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {home && <Footer />}
    </div>
  );
}

function Footer() {
  const repo = 'https://github.com/ritangkar/sap-commerce-code-generator';
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>Offline by design: no backend, no analytics, no SAP connection. Generated code is scaffolding – review before use.</span>
        <nav aria-label="Project links">
          <a href={repo} rel="noreferrer">Repository</a>
          <a href={`${repo}/blob/main/docs/OCC_GENERATOR.md`} rel="noreferrer">OCC docs</a>
          <a href={`${repo}/blob/main/docs/IMPEX_GENERATOR.md`} rel="noreferrer">ImpEx docs</a>
          <a href={`${repo}/blob/main/README.md`} rel="noreferrer">README</a>
        </nav>
      </div>
    </footer>
  );
}

function NotFound() {
  const loc = useLocation();
  return (
    <div className="notfound">
      <h1>Page not found</h1>
      <p className="muted">There is no page at <code>{loc.pathname}</code>.</p>
      <div className="pill-row">
        <Link className="btn btn-primary" to="/">Back to home</Link>
        <Link className="btn" to={ROUTES.occ}>OCC Controller</Link>
        <Link className="btn" to={ROUTES.impex}>ImpEx</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </HashRouter>
  );
}
