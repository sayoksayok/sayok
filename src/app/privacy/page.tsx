import Link from 'next/link';

const sections = [
  {
    title: 'What SayOK processes',
    body:
      'SayOK processes the text you paste so it can generate clearer, more natural rewrites in your chosen output language. If you are signed in, we may also store your history and account status so you can revisit past checks.',
  },
  {
    title: 'What to avoid pasting',
    body:
      'Do not paste passwords, payment details, government IDs, or highly sensitive medical or legal information unless you are comfortable sharing that data with the service providers required to generate the result.',
  },
  {
    title: 'How we use results',
    body:
      'Generated outputs are used to provide the rewrite you requested, enforce plan limits, improve product reliability, and support account features such as history for signed-in users.',
  },
  {
    title: 'Questions',
    body:
      'For support or privacy questions, contact info@sayok.ai.',
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.14),_transparent_32%),linear-gradient(180deg,#fffdf7_0%,#fff7ed_100%)] text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-orange-700 hover:text-orange-800">
          ← Back to SayOK
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-4 text-base leading-7 text-gray-600">
          This page is a plain-language summary of how SayOK handles the text you submit.
        </p>
        <div className="mt-10 space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-3xl border border-orange-100 bg-white/90 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-gray-600">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
