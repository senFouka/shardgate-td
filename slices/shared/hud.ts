/**
 * A light HTML HUD for the slice: lives, gold, wave, kills, and an optional
 * fps readout (?fps=1). Graphics settings use the game's own panel.
 */
export function mountHud(direction: string): { setGold(n: number): void; setKills(n: number): void } {
  const style = document.createElement('style');
  style.textContent = `
    .hud { position: fixed; left: 0; right: 0; top: 0; display: flex; justify-content: center; gap: 14px; padding: 10px; pointer-events: none;
           font: 600 15px/1 'Segoe UI', Roboto, Arial, sans-serif; color: #f3ead2; text-shadow: 0 1px 2px #000; z-index: 1; }
    .hud .chip { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px;
                 background: linear-gradient(#2b2219ee, #18120dee); border: 1px solid #8a6b3a; box-shadow: inset 0 1px 0 #c9a46655, 0 3px 8px #0008; }
    .hud .dot { width: 12px; height: 12px; border-radius: 50%; }
    .tag { position: fixed; left: 12px; bottom: 12px; z-index: 3; font: 600 12px 'Segoe UI', Arial, sans-serif; color: #f3ead2aa; text-shadow: 0 1px 2px #000; }
    .fps { position: fixed; left: 12px; top: 12px; z-index: 3; font: 12px monospace; color: #9f9; text-shadow: 0 1px 2px #000; }
  `;
  document.head.appendChild(style);
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="chip"><span class="dot" style="background:radial-gradient(#ff9a9a,#c8283a)"></span><span>20</span></div>
    <div class="chip"><span class="dot" style="background:radial-gradient(#fff2a8,#d39b1c)"></span><span id="hud-gold">120</span></div>
    <div class="chip">Wave <span>7</span>/40</div>
    <div class="chip">Kills <span id="hud-kills">0</span></div>`;
  document.body.appendChild(hud);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = `Step 0 slice: ${direction}`;
  document.body.appendChild(tag);
  if (new URLSearchParams(location.search).has('fps')) {
    const el = document.createElement('div');
    el.className = 'fps';
    document.body.appendChild(el);
    let frames = 0;
    let t0 = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - t0 > 500) {
        el.textContent = `${((frames * 1000) / (now - t0)).toFixed(0)} fps`;
        frames = 0;
        t0 = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  const gold = document.getElementById('hud-gold')!;
  const kills = document.getElementById('hud-kills')!;
  return {
    setGold: (n) => (gold.textContent = String(n)),
    setKills: (n) => (kills.textContent = String(n)),
  };
}
