// Intro and end cards in the app's Doodle look (paper, grid, ink, lime highlighter).
const head = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&family=JetBrains+Mono:wght@500;700&family=Patrick+Hand&display=swap" rel="stylesheet">
<style>
:root{--paper:#f0ede8;--ink:#0a0a0a;--lime:#c8ff00}
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;background-color:var(--paper);
 background-image:linear-gradient(rgba(10,10,10,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(10,10,10,.07) 1px,transparent 1px);
 background-size:48px 48px;color:var(--ink);font-family:'Archivo',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;overflow:hidden}
h1{font-weight:800;font-size:170px;letter-spacing:-5px;line-height:1}
h1 .hl{background:linear-gradient(transparent 58%,var(--lime) 58% 92%,transparent 92%);padding:0 10px}
.hand{font-family:'Patrick Hand',cursive;font-size:54px}
.mono{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:40px}
.box{border:5px solid var(--ink);border-radius:14px;padding:18px 34px;background:#fff;box-shadow:9px 9px 0 var(--ink)}
.row{display:flex;gap:34px}
.fade{animation:up .9s ease both}
@keyframes up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
</style></head><body>`;
export const introCard = head + `
<div class="hand fade" style="font-size:46px">hackathon demo · Monad testnet</div>
<h1 class="fade" style="animation-delay:.2s"><span class="hl">Hisab</span> on Monad</h1>
<div class="hand fade" style="animation-delay:.7s;font-size:64px">Ships today. Paid in 60–90 days.</div>
<div class="row fade" style="animation-delay:1.2s">
 <div class="box mono">MSME exporter</div><div class="box mono">AUSD advance, same day</div><div class="box mono">Onchain lender</div>
</div></body></html>`;
export const endCard = head + `
<h1 class="fade"><span class="hl">Hisab</span> on Monad</h1>
<div class="box mono fade" style="animation-delay:.4s">hisab-monad.vercel.app</div>
<div class="box mono fade" style="animation-delay:.7s">github.com/vj-io/hisab-monad</div>
<div class="hand fade" style="animation-delay:1s">Built on Monad testnet · AUSD · Privy</div>
</body></html>`;
