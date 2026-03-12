export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-zinc-900">Terms of Service</h1>

        <p className="mt-4 text-sm text-zinc-600">
          Last updated: {new Date().getFullYear()}
        </p>

        <div className="mt-6 space-y-5 text-sm text-zinc-700">
          <p>
            These Terms govern your use of AceUTME. By accessing or purchasing
            a subscription to AceUTME Pro, you agree to these terms.
          </p>

          <h2 className="font-semibold text-zinc-900">1. Service</h2>
          <p>
            AceUTME provides exam preparation tools, mock examinations, and
            educational content designed to help students prepare for UTME
            exams.
          </p>

          <h2 className="font-semibold text-zinc-900">2. Subscription</h2>
          <p>
            AceUTME Pro is a paid subscription that unlocks premium features,
            including full mock examinations and advanced study tools.
          </p>

          <h2 className="font-semibold text-zinc-900">3. Payments</h2>
          <p>
            Payments are processed securely by third-party payment providers
            such as Paystack. We do not store your card details.
          </p>

          <h2 className="font-semibold text-zinc-900">4. Refunds</h2>
          <p>
            Payments are generally non-refundable except where required by law
            or where a billing error has occurred.
          </p>

          <h2 className="font-semibold text-zinc-900">5. Acceptable Use</h2>
          <p>
            You agree not to misuse the service, attempt to hack the platform,
            or redistribute content without permission.
          </p>

          <h2 className="font-semibold text-zinc-900">6. Changes</h2>
          <p>
            AceUTME may update these terms from time to time. Continued use of
            the service constitutes acceptance of the updated terms.
          </p>

          <h2 className="font-semibold text-zinc-900">7. Contact</h2>
          <p>
            For questions about these terms, contact us at:
            <br />
            <b>support@aceutme.com</b>
          </p>
        </div>
      </div>
    </main>
  );
}
