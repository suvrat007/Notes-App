import React, { useEffect, useState } from 'react';
import { Download, Check, Share, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * Install this as an app.
 *
 * Browsers will not let a page ask on its own: Chrome fires
 * `beforeinstallprompt` when IT decides the app qualifies, and that event is
 * the ONLY thing that can open the install dialog — and only once, from a real
 * click. So the event is caught and held, and the button is offered when there
 * is something to offer.
 *
 * iOS is the exception that has to be handled by hand. Safari never fires the
 * event and has no programmatic install at all, so the only honest thing to do
 * there is show the two taps that actually work. Getting this wrong means an
 * iPhone user pressing a button that silently does nothing.
 */

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches
  // iOS marks an installed PWA here rather than through display-mode.
  || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const InstallApp = ({ showToast }) => {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const capture = (e) => {
      // Stops the browser's own mini-infobar so there is one way in, not two.
      e.preventDefault();
      setDeferred(e);
    };
    const done = () => { setInstalled(true); setDeferred(null); };

    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') showToast?.('Installing…');
      else showToast?.('Maybe later, then');
    } catch {
      showToast?.('That did not open. Try your browser menu instead.', 'error');
    } finally {
      // The event is single-use whatever the answer; holding a spent one would
      // leave a button that does nothing on the second press.
      setDeferred(null);
      setBusy(false);
    }
  };

  if (installed) {
    return (
      <Card
        className="bg-[#16191e] border-white/5 rounded-xl p-5"
        data-testid="install-installed"
      >
        <div className="w-8 h-8 rounded bg-white/5 grid place-items-center text-[#3ecf8e] mb-4">
          <Check size={16} />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Installed</h3>
        <p className="text-xs text-white/60">
          You are running this as an app. It works offline and keeps its own window.
        </p>
      </Card>
    );
  }

  if (isIos() && !deferred) {
    return (
      <Card className="bg-[#16191e] border-white/5 rounded-xl p-5" data-testid="install-ios">
        <div className="w-8 h-8 rounded bg-white/5 grid place-items-center text-white/40 mb-4">
          <Download size={16} />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Add to Home Screen</h3>
        {/* Safari has no install API, so the steps are the whole answer. */}
        <p className="text-xs text-white/60 mb-3">
          Safari cannot be asked to do this from a page, so it takes two taps:
        </p>
        <ol className="space-y-1.5 text-xs text-white/70">
          <li className="flex items-center gap-2">
            <Share size={13} className="text-[#c0b3a5] shrink-0" />
            Tap Share in the browser bar
          </li>
          <li className="flex items-center gap-2">
            <Plus size={13} className="text-[#c0b3a5] shrink-0" />
            Then "Add to Home Screen"
          </li>
        </ol>
      </Card>
    );
  }

  return (
    <Card className="bg-[#16191e] border-white/5 rounded-xl p-5" data-testid="install-card">
      <div className="flex justify-between items-start mb-4">
        <div className="w-8 h-8 rounded bg-white/5 grid place-items-center text-white/40">
          <Download size={16} />
        </div>
      </div>
      <h3 className="text-base font-bold text-white mb-1">Install the app</h3>
      <p className="text-xs text-white/60 mb-4">
        {deferred
          ? 'Its own window, its own icon, and it opens without a browser.'
          : 'Your browser has not offered this yet. It usually appears after a couple of visits, or use "Install" in the browser menu.'}
      </p>
      <button
        type="button"
        onClick={install}
        disabled={!deferred || busy}
        data-testid="install-button"
        className="w-full h-11 rounded-xl bg-[#c0b3a5] text-black font-bold text-[11px] tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#cfc4b8] transition-colors"
      >
        {busy ? 'OPENING…' : 'INSTALL'}
      </button>
    </Card>
  );
};

export default InstallApp;
