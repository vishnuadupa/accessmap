export default function HeroSection() {
  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden"
      style={{ background: "#0c0c0c" }}
    >
      {/* Subtle radial glow behind text */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(74,222,128,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Top nav */}
      <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-6">
        <span className="text-xs tracking-[0.3em] uppercase" style={{ color: "var(--text-2)" }}>
          AccessMap
        </span>
        <span
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" style={{ background: "var(--accent)" }} />
          Open Source · Free Forever
        </span>
      </nav>

      {/* Hero text */}
      <div className="relative z-10 max-w-5xl mx-auto">
        <p className="text-xs tracking-[0.4em] uppercase mb-8" style={{ color: "var(--text-3)" }}>
          01 — Accessible Parking
        </p>

        <h1
          className="font-black leading-none tracking-tighter mb-6"
          style={{ fontSize: "clamp(3rem, 10vw, 8rem)", color: "var(--text)" }}
        >
          Find parking
          <br />
          <span style={{ color: "var(--accent)" }}>that works</span>
          <br />
          for you.
        </h1>

        <p
          className="max-w-xl mx-auto text-lg leading-relaxed mb-12"
          style={{ color: "var(--text-2)" }}
        >
          The only tool that distinguishes van-accessible spots from standard
          accessible spots — and shows when accessibility was last verified by a
          real person. Apple Maps and Google Maps don&apos;t do this.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
          {[
            { icon: "🚐", label: "Van-accessible detection" },
            { icon: "✅", label: "Crowd-verified timestamps" },
            { icon: "🛣️", label: "Wheelchair routing" },
            { icon: "⚠️", label: "Steps & height warnings" },
          ].map((f) => (
            <span
              key={f.label}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
              }}
            >
              <span>{f.icon}</span>
              {f.label}
            </span>
          ))}
        </div>

        {/* CTA */}
        <a
          href="#app"
          className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-base transition-all duration-200"
          style={{
            background: "var(--accent)",
            color: "#0c0c0c",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#86efac")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          Find Parking
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-xs tracking-widest uppercase" style={{ color: "var(--text-3)" }}>
          Scroll
        </span>
        <div className="w-px h-12" style={{ background: "linear-gradient(to bottom, var(--border-2), transparent)" }} />
      </div>
    </section>
  );
}
