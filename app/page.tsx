import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AceUTME — JAMB CBT Practice & Full UTME Mock",
  description:
    "Practice JAMB-standard questions with a real CBT simulation: timed full mock (180), review screen, progress tracking, and subject practice.",
  keywords: [
    "JAMB",
    "UTME",
    "CBT",
    "JAMB past questions",
    "UTME mock",
    "JAMB practice",
    "AceUTME",
  ],
  openGraph: {
    title: "AceUTME — JAMB CBT Practice & Full UTME Mock",
    description:
      "Practice JAMB-standard questions with a real CBT simulation: timed full mock (180), review screen, progress tracking, and subject practice.",
    type: "website",
  },
};

const BRAND = {
  name: "AceUTME",
  accent: "from-emerald-500 to-cyan-500",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      {/* Top glow background */}
      <div className="pointer-events-none absolute left-1/2 top-[-120px] h-[380px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-200/60 via-cyan-200/40 to-blue-200/50 blur-3xl" />

      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white">
              <span className="text-sm font-bold">A</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold">{BRAND.name}</div>
              <div className="text-xs text-zinc-500">JAMB CBT Simulator</div>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <a
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 sm:inline-flex"
            >
              Login
            </a>
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Get Started
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Free practice + Full UTME Mock (180)
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Pass UTME with confidence —{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
                like the real CBT
              </span>
              .
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">
              Practice JAMB-standard questions by subject, take a timed full mock (English 60 + 3
              subjects x 40), review flagged questions, and track your progress.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Start Practicing (Free)
              </a>
              <a
                href="/cbt/full"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Try Full Mock
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">✅ Subject practice</span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">✅ Review screen</span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">✅ Progress tracking</span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">✅ Admin CSV upload</span>
            </div>
          </div>

          {/* Animated preview card */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-r from-emerald-200/60 via-cyan-200/40 to-blue-200/50 blur-2xl" />

            <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="text-sm font-semibold">CBT Preview</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Time</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Review</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Calc</span>
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs text-zinc-500">Question 12 of 180</div>
                <div className="mt-2 text-base font-semibold">
                  Choose the option nearest in meaning to the underlined word:
                  <span className="font-bold"> reluctant</span>
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    ["A", "eager"],
                    ["B", "unwilling"],
                    ["C", "excited"],
                    ["D", "prepared"],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className={`rounded-xl border p-3 ${
                        k === "B" ? "border-emerald-600 bg-emerald-50" : "border-zinc-200 bg-white"
                      }`}
                    >
                      <div className="text-sm">
                        <span className="font-semibold">{k}.</span> {v}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full w-[38%] bg-gradient-to-r from-emerald-500 to-cyan-500 animate-[progress_3s_ease-in-out_infinite]" />
                  </div>
                  <div className="text-xs text-zinc-500">38%</div>
                </div>

                <style>{`
                  @keyframes progress {
                    0% { width: 20%; }
                    50% { width: 72%; }
                    100% { width: 20%; }
                  }
                `}</style>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Why students use {BRAND.name}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-600">
            Built to feel like JAMB CBT: fast navigation, review screen, timer, and subject-based practice.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Real CBT Simulation",
                desc: "Timer, question grid, review/flag flow, and full mock exam structure.",
              },
              {
                title: "Full UTME Mock (180)",
                desc: "English (60) + 3 subjects (40 each), just like the real exam format.",
              },
              {
                title: "Progress Tracking",
                desc: "See attempts, accuracy, and weak areas by subject.",
              },
              {
                title: "AI Explanation (optional)",
                desc: "Get simple explanations after you answer (when enabled).",
              },
              {
                title: "Admin CSV Upload",
                desc: "Upload questions by subject using CSV. Fix/validate before import.",
              },
              {
                title: "Mobile Friendly",
                desc: "Clean layout that works well on phones and tablets.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-base font-semibold">{f.title}</div>
                <div className="mt-2 text-sm text-zinc-600">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Students love it</h2>
          <p className="mt-3 text-center text-zinc-600">Simple, fast, and close to the real CBT feeling.</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Chidera, SS3",
                text: "The full mock feels like the real thing. The timer + question grid helped me manage time.",
              },
              {
                name: "Seyi, Candidate",
                text: "I like that I can practice by subject and see my progress. It makes revision easier.",
              },
              {
                name: "Amina, SS3",
                text: "The interface is clean on my phone. I practice during breaks without stress.",
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
                <div className="text-sm text-zinc-700">“{t.text}”</div>
                <div className="mt-4 text-sm font-semibold">{t.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Pricing</h2>
          <p className="mt-3 text-center text-zinc-600">Free forever for practice. Upgrade when you want more.</p>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {/* Free */}
            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold">Freemium</div>
                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                  Recommended
                </div>
              </div>
              <div className="mt-2 text-3xl font-extrabold">₦0</div>
              <div className="mt-1 text-sm text-zinc-600">Practice by subject + basic progress.</div>

              <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                <li>✅ Subject practice (all subjects)</li>
                <li>✅ Save attempts</li>
                <li>✅ Progress page</li>
              </ul>

              <a
                href="/signup"
                className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Start Free
              </a>
            </div>

            {/* Pro */}
            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <div className="text-lg font-bold">Pro</div>

              <div className="mt-2 text-3xl font-extrabold">₦5,000</div>
              <div className="mt-1 text-sm text-zinc-600">per month. More exam features.</div>

              <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                <li>✅ Full Mock UTME (180) with review screen</li>
                <li>✅ Flag questions + submit modal</li>
                <li>✅ Calculator (sciences) + draggable</li>
                <li>✅ AI explanations</li>
              </ul>

              {/* ✅ IMPORTANT: send users to checkout, not signup */}
              <a
                href="/checkout"
                className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Subscribe — ₦5,000 / month
              </a>

              {/* Payment methods (display only) */}
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700">Payment methods</div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Paystack</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Flutterwave</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Card</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Bank Transfer</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">USSD</span>
                </div>

                <div className="mt-2 text-[11px] text-zinc-500">
                  Secure checkout. You’ll be redirected to complete payment.
                </div>
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Note: payment integration can be enabled when you’re ready (Paystack/Flutterwave).
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-zinc-600">
            <a className="underline" href="/login">
              Login
            </a>
            <span>•</span>
            <a className="underline" href="/signup">
              Create account
            </a>
            <span>•</span>
            <a className="underline" href="/admin/login">
              Admin login
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-zinc-500 sm:px-6">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </div>
      </footer>
    </main>
  );
}