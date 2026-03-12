export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-zinc-900">Privacy Policy</h1>

        <p className="mt-4 text-sm text-zinc-600">
          Last updated: {new Date().getFullYear()}
        </p>

        <div className="mt-6 space-y-5 text-sm text-zinc-700">
          <p>
            AceUTME respects your privacy and is committed to protecting your
            personal data.
          </p>

          <h2 className="font-semibold text-zinc-900">1. Information We Collect</h2>
          <p>
            When you create an account we may collect your name, email address,
            and account information.
          </p>

          <h2 className="font-semibold text-zinc-900">2. Payment Information</h2>
          <p>
            Payments are processed through third-party providers such as
            Paystack. AceUTME does not store your credit or debit card details.
          </p>

          <h2 className="font-semibold text-zinc-900">3. Usage Data</h2>
          <p>
            We may collect information about how you use the platform to
            improve the service.
          </p>

          <h2 className="font-semibold text-zinc-900">4. Data Protection</h2>
          <p>
            We implement appropriate security measures to protect your
            personal data.
          </p>

          <h2 className="font-semibold text-zinc-900">5. Sharing of Data</h2>
          <p>
            We do not sell your personal data. Information may be shared only
            with service providers necessary to operate the platform.
          </p>

          <h2 className="font-semibold text-zinc-900">6. Contact</h2>
          <p>
            For privacy questions contact:
            <br />
            <b>support@aceutme.com</b>
          </p>
        </div>
      </div>
    </main>
  );
}
