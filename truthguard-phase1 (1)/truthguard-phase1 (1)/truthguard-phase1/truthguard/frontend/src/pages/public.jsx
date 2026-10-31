import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner } from '../components/ui.jsx';
import { VerificationResult } from '../components/VerificationResult.jsx';

const Page = ({ title, children, intro }) => (
  <div className="container narrow section">
    <h1>{title}</h1>
    {intro && <p className="muted">{intro}</p>}
    {children}
  </div>
);

export const Landing = () => (
  <>
    <section className="hero container">
      <h1>Check claims against evidence, not intuition.</h1>
      <p>TruthGuard AI is a verification workspace for text, images, video and links. Each result is meant to come with its sources, so you can review the evidence yourself.</p>
      <div className="header-actions">
        <Link className="btn btn-primary" to="/signup">Create an account</Link>
        <Link className="btn" to="/how-it-works">How it works</Link>
      </div>
    </section>
    <section className="container section">
      <div className="grid grid-3">
        {[['Text', 'Submit a statement or passage to check its claims.'], ['Images', 'Upload an image to examine its origin and integrity.'], ['Video', 'Upload a clip to review its authenticity.'], ['URLs', 'Submit a link to assess the page and its claims.']].map(([t, d]) => (
          <div className="card" key={t}><h3>{t} verification</h3><p className="muted">{d}</p></div>
        ))}
      </div>
    </section>
  </>
);

export const About = () => (
  <Page title="About TruthGuard AI" intro="TruthGuard AI is a fact-verification platform built to make the reasoning behind a verdict inspectable.">
    <p>The platform is designed around evidence: every verdict should be linked to the sources it relies on, with the confidence and limitations stated plainly.</p>
    <p>The product is under active development. Verification features are released in stages, and only features that are fully working are presented as available.</p>
  </Page>
);

export const HowItWorks = () => (
  <Page title="How it works">
    <ol className="steps">
      <li><strong>Submit content.</strong> Choose text, image, video or URL in the verification workspace.</li>
      <li><strong>Analysis.</strong> The content is analysed and compared against retrieved evidence sources.</li>
      <li><strong>Review the report.</strong> Results include a verdict, supporting and contradicting sources, and stated confidence.</li>
      <li><strong>Save and revisit.</strong> Keep reports in your history and saved reports.</li>
    </ol>
    <p className="muted small">Analysis and evidence retrieval are not yet connected in this release.</p>
  </Page>
);

const faqs = [
  ['Who can use TruthGuard AI?', 'Anyone with an account. Registration requires an email address and a password.'],
  ['Are verification results available now?', 'Not yet. The workspace interface is in place; the verification engine is being built in later phases.'],
  ['Is my content private?', 'Submitted content is associated with your account. See the Privacy Policy for details.'],
  ['Can a verdict be wrong?', 'Yes. Automated verification has limits, which is why sources and confidence are shown alongside any verdict.'],
];

export const FAQ = () => (
  <Page title="Frequently asked questions">
    {faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
  </Page>
);

const Draft = () => <div className="alert alert-info">Draft document. This text has not been reviewed by legal counsel and must be before public launch.</div>;

export const Privacy = () => (
  <Page title="Privacy Policy">
    <Draft />
    <h2>Data we collect</h2><p>Account details (name, email), a hashed password, session metadata (IP address, user agent) and the content you submit for verification.</p>
    <h2>How we use it</h2><p>To provide authentication, run verification requests, and maintain security audit logs.</p>
    <h2>Your controls</h2><p>You can update your profile and change your password in Settings. Account deletion and data export are not yet available.</p>
  </Page>
);

export const Terms = () => (
  <Page title="Terms and Conditions">
    <Draft />
    <h2>Use of the service</h2><p>You agree to use TruthGuard AI lawfully and not to attempt to disrupt or gain unauthorised access to the service.</p>
    <h2>Accuracy</h2><p>Verification output is informational and may be incomplete or incorrect. You are responsible for decisions made using it.</p>
    <h2>Accounts</h2><p>Keep your credentials confidential. We may suspend accounts that violate these terms.</p>
  </Page>
);

export const SharedReport = () => {
  const { token } = useParams();
  const [state, setState] = useState({ data: null, error: '', loading: true });

  useEffect(() => {
    let live = true;
    api(`/reports/shared/${token}`)
      .then((data) => live && setState({ data, error: '', loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [token]);

  if (state.loading) {
    return (
      <div className="container narrow section center">
        <Spinner />
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <div className="container narrow section">
        <h1>Report unavailable</h1>
        <div className="alert alert-error">
          {state.error || 'This shared report could not be found, or its public access link has been revoked by the creator.'}
        </div>
        <Link className="btn btn-primary" to="/">
          Go to TruthGuard Home
        </Link>
      </div>
    );
  }

  const report = state.data;

  return (
    <div className="container section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <span className="badge badge-supported" style={{ marginBottom: '0.4rem' }}>
            Public Shared Verification Report
          </span>
          <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{report.title}</h1>
          <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
            Saved {new Date(report.savedAt).toLocaleDateString()} • Verified via TruthGuard Evidence Engine
          </p>
        </div>
        <div>
          <Link className="btn btn-primary" to="/signup">
            Verify Your Own Claims
          </Link>
        </div>
      </div>

      <VerificationResult
        request={{
          id: report.requestId,
          type: report.type,
          inputText: report.submittedContent,
          createdAt: report.submittedAt,
          result: report.result,
        }}
        isSharedView={true}
      />
    </div>
  );
};
