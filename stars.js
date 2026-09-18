/* B2B Hacks — ambient twinkling starfield + shooting stars. Pure canvas, no assets. */
(function () {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  c.id = "stars";
  document.body.prepend(c);
  const x = c.getContext("2d");
  let W, H, t = 0;
  const stars = [], shoots = [];
  function size() { W = c.width = innerWidth; H = c.height = innerHeight; }
  size();
  addEventListener("resize", size);
  for (let i = 0; i < 150; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5 });
  (function loop() {
    t += 0.03;
    x.clearRect(0, 0, W, H);
    for (const s of stars) {
      x.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t * s.s + s.p));
      x.fillStyle = "#fff";
      x.beginPath(); x.arc(s.x * W, s.y * H, s.r, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    if (Math.random() < 0.008 && shoots.length < 2) shoots.push({ x: Math.random() * W * 0.7 + W * 0.2, y: Math.random() * H * 0.3, vx: -7 - Math.random() * 4, vy: 3 + Math.random() * 2, life: 1 });
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      x.strokeStyle = "rgba(255,255,255," + s.life.toFixed(2) + ")";
      x.lineWidth = 2;
      x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - s.vx * 8, s.y - s.vy * 8); x.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.02;
      if (s.life <= 0) shoots.splice(i, 1);
    }
    requestAnimationFrame(loop);
  })();

  /* sprinkled ✦ sparkles for the intro overlay + every question card */
  const GLYPHS = ["✦", "✧", "★", "✦"];
  window.sprinkleSparkles = function (container, n) {
    if (!container) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    container.querySelectorAll(":scope > .sparkle").forEach((s) => s.remove());
    for (let i = 0; i < (n || 8); i++) {
      const s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = GLYPHS[i % GLYPHS.length];
      const size = 10 + Math.random() * 14;
      s.style.cssText = "left:" + (Math.random() * 92) + "%;top:" + (Math.random() * 85) + "%;font-size:" + size.toFixed(0) + "px;animation-delay:" + (Math.random() * 1.8).toFixed(2) + "s;";
      container.appendChild(s);
    }
  };
  // intro splash gets its own constellation on load
  document.addEventListener("DOMContentLoaded", () => sprinkleSparkles(document.querySelector(".splash-inner"), 14));
})();
