export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Payment received</h1>
        <p className="mt-2 text-zinc-600">
          Your payment is being confirmed. If your premium access does not show immediately,
          refresh your dashboard in a few seconds.
        </p>

        <div className="mt-6 flex gap-3">
          <a
            href="/dashboard"
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Go to Dashboard
          </a>

          <a
            href="/cbt/full"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
          >
            Open Full Mock
          </a>
        </div>
      </div>
    </main>
  );
}
