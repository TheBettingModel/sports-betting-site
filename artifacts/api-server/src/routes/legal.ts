import { Router } from "express";

const router = Router();

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — TheBettingModel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f;
      --card: #111118;
      --border: #1e1e2e;
      --fg: #f0f0f5;
      --muted: #8888aa;
      --gold: #d4a843;
      --radius: 12px;
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
      padding: 0 16px 60px;
    }
    header {
      max-width: 680px;
      margin: 0 auto;
      padding: 48px 0 32px;
      border-bottom: 1px solid var(--border);
    }
    .logo {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .meta {
      font-size: 13px;
      color: var(--muted);
    }
    main {
      max-width: 680px;
      margin: 0 auto;
      padding-top: 36px;
    }
    section { margin-bottom: 36px; }
    h2 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    p { color: var(--muted); font-size: 15px; margin-bottom: 12px; }
    ul { color: var(--muted); font-size: 15px; padding-left: 20px; margin-bottom: 12px; }
    li { margin-bottom: 6px; }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-top: 8px;
    }
    footer {
      max-width: 680px;
      margin: 48px auto 0;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">TheBettingModel</div>
    <h1>Privacy Policy</h1>
    <p class="meta">Effective date: July 21, 2025 &nbsp;·&nbsp; Last updated: July 21, 2025</p>
  </header>

  <main>
    <section>
      <p>
        TheBettingModel ("we", "our", or "us") operates the TheBettingModel mobile application
        (the "App"). This Privacy Policy explains what information we collect, how we use it,
        and the choices you have. By using the App you agree to this policy.
      </p>
    </section>

    <section>
      <h2>1. Information We Collect</h2>
      <div class="card">
        <p><strong style="color:#f0f0f5">Account information</strong></p>
        <p>When you create an account we collect your email address and, if you use Google
        Sign-In, your Google profile name. This is handled by Clerk, our authentication
        provider.</p>

        <p><strong style="color:#f0f0f5">Subscription data</strong></p>
        <p>Purchase receipts and subscription status are processed by RevenueCat on our
        behalf. We do not store credit card or payment details on our servers.</p>

        <p><strong style="color:#f0f0f5">Push notification tokens</strong></p>
        <p>If you enable daily pick alerts we store a device push token so we can deliver
        notifications to your device. You can disable this at any time in the App.</p>

        <p><strong style="color:#f0f0f5">Usage data</strong></p>
        <p>We log which sports and picks you view to improve model accuracy and personalise
        your experience. Logs are associated with your user account, not your device.</p>

        <p><strong style="color:#f0f0f5">Device &amp; technical information</strong></p>
        <p>We collect your device operating system and app version to diagnose crashes and
        deliver over-the-air updates via Expo.</p>
      </div>
    </section>

    <section>
      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To authenticate you and keep your account secure</li>
        <li>To verify your subscription status and unlock Pro features</li>
        <li>To send daily pick alert push notifications (only if you opt in)</li>
        <li>To improve the accuracy of our sports prediction models</li>
        <li>To diagnose bugs and deliver app updates</li>
        <li>To comply with legal obligations</li>
      </ul>
      <p>We do not sell your personal information to third parties.</p>
    </section>

    <section>
      <h2>3. Third-Party Services</h2>
      <p>The App uses the following third-party services that have their own privacy policies:</p>
      <ul>
        <li><a href="https://clerk.com/legal/privacy" target="_blank">Clerk</a> — authentication and account management</li>
        <li><a href="https://www.revenuecat.com/privacy" target="_blank">RevenueCat</a> — subscription and purchase management</li>
        <li><a href="https://expo.dev/privacy" target="_blank">Expo</a> — app delivery and push notifications</li>
        <li><a href="https://apple.com/legal/privacy" target="_blank">Apple</a> — App Store distribution and in-app purchases</li>
      </ul>
    </section>

    <section>
      <h2>4. Data Retention</h2>
      <p>
        We retain your account and usage data for as long as your account is active.
        If you delete your account, we will delete or anonymise your personal data within
        30 days, except where we are required to retain it by law.
      </p>
      <p>
        Push notification tokens are deleted when you disable alerts or sign out.
      </p>
    </section>

    <section>
      <h2>5. Your Rights</h2>
      <p>Depending on your location you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Object to or restrict certain processing</li>
        <li>Port your data to another service</li>
      </ul>
      <p>
        To exercise any of these rights, or to delete your account, email us at
        <a href="mailto:Jacqueskaune@gmail.com">Jacqueskaune@gmail.com</a>.
        We will respond within 30 days.
      </p>
    </section>

    <section>
      <h2>6. Children's Privacy</h2>
      <p>
        The App is intended for users aged 18 and older. We do not knowingly collect
        personal information from anyone under 18. If you believe a minor has provided
        us with personal data, please contact us and we will delete it promptly.
      </p>
    </section>

    <section>
      <h2>7. Security</h2>
      <p>
        We use industry-standard encryption in transit (TLS) and at rest. Authentication
        tokens are short-lived JWTs issued by Clerk. We do not store plaintext passwords.
      </p>
    </section>

    <section>
      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. When we do, we will update the
        "Last updated" date at the top of this page. Continued use of the App after
        changes constitutes your acceptance of the revised policy.
      </p>
    </section>

    <section>
      <h2>9. Contact Us</h2>
      <div class="card">
        <p>Questions about this policy? Reach us at:</p>
        <p><a href="mailto:Jacqueskaune@gmail.com">Jacqueskaune@gmail.com</a></p>
      </div>
    </section>
  </main>

  <footer>
    &copy; ${new Date().getFullYear()} TheBettingModel. All rights reserved.
  </footer>
</body>
</html>`;

router.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PRIVACY_HTML);
});

// ── Terms of Use ─────────────────────────────────────────────────────────────

const TERMS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Use — TheBettingModel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f;
      --card: #111118;
      --border: #1e1e2e;
      --fg: #f0f0f5;
      --muted: #8888aa;
      --gold: #d4a843;
      --radius: 12px;
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
      padding: 0 16px 60px;
    }
    header {
      max-width: 680px;
      margin: 0 auto;
      padding: 48px 0 32px;
      border-bottom: 1px solid var(--border);
    }
    .logo {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
    .meta { font-size: 13px; color: var(--muted); }
    main { max-width: 680px; margin: 0 auto; padding-top: 36px; }
    section { margin-bottom: 36px; }
    h2 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    p { color: var(--muted); font-size: 15px; margin-bottom: 12px; }
    ul { color: var(--muted); font-size: 15px; padding-left: 20px; margin-bottom: 12px; }
    li { margin-bottom: 6px; }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-top: 8px;
    }
    .highlight {
      background: var(--card);
      border-left: 3px solid var(--gold);
      border-radius: 0 var(--radius) var(--radius) 0;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    footer {
      max-width: 680px;
      margin: 48px auto 0;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">TheBettingModel</div>
    <h1>Terms of Use</h1>
    <p class="meta">Effective date: July 27, 2025 &nbsp;·&nbsp; Last updated: July 27, 2025</p>
  </header>

  <main>
    <section>
      <div class="highlight">
        <p style="color:#f0f0f5; margin-bottom:0;">
          <strong>Important:</strong> TheBettingModel provides sports analytics and
          model-based picks for <strong>informational and entertainment purposes only</strong>.
          It does not facilitate, accept, or process real-money wagers of any kind.
          You must be 18 years of age or older (or the minimum legal age in your jurisdiction)
          to use this app.
        </p>
      </div>
    </section>

    <section>
      <h2>1. Acceptance of Terms</h2>
      <p>
        By downloading, installing, or using the TheBettingModel mobile application ("App"),
        you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these
        Terms, do not use the App.
      </p>
      <p>
        We may update these Terms from time to time. Your continued use of the App after
        changes are posted constitutes acceptance of the revised Terms.
      </p>
    </section>

    <section>
      <h2>2. Informational Purpose Only</h2>
      <p>
        All content provided by TheBettingModel — including model picks, confidence scores,
        edge percentages, line movement analysis, and any other data — is provided solely for
        informational and entertainment purposes.
      </p>
      <ul>
        <li>TheBettingModel does not place, accept, or process wagers on your behalf.</li>
        <li>Past model performance is not a guarantee of future results.</li>
        <li>Sports betting involves significant financial risk. Never wager more than you can afford to lose.</li>
        <li>You are solely responsible for any betting decisions you make.</li>
      </ul>
      <p>
        If you choose to place wagers based on information from the App, you do so entirely
        at your own risk and in accordance with the laws of your jurisdiction.
      </p>
    </section>

    <section>
      <h2>3. Eligibility</h2>
      <p>
        You must be at least 18 years of age — or the minimum legal age required to engage
        with gambling-related content in your jurisdiction, whichever is greater — to use
        this App. By using the App, you confirm that you meet this age requirement.
      </p>
      <p>
        You are responsible for ensuring that your use of the App complies with all applicable
        laws and regulations in your location. Access to certain features may be unavailable
        in jurisdictions where sports analytics services are restricted.
      </p>
    </section>

    <section>
      <h2>4. Accounts</h2>
      <p>
        You must create an account to access the App. You are responsible for maintaining
        the confidentiality of your login credentials and for all activity that occurs under
        your account. Notify us immediately at
        <a href="mailto:support@thebettingmodel.com">support@thebettingmodel.com</a>
        if you suspect unauthorised access.
      </p>
      <p>
        You may request deletion of your account at any time by emailing us at the address
        above or using the "Delete Account" option in the App's profile screen. We will
        process your request within 30 days.
      </p>
    </section>

    <section>
      <h2>5. Subscriptions and Billing</h2>
      <div class="card">
        <p><strong style="color:#f0f0f5">Free tier</strong></p>
        <p>Basic model picks are available at no charge.</p>

        <p><strong style="color:#f0f0f5">Pro subscription</strong></p>
        <p>
          Premium features — including full pick details, confidence scores, and line movement
          data — require an active Pro subscription. Subscription pricing is displayed in the
          App before purchase.
        </p>

        <p><strong style="color:#f0f0f5">Billing</strong></p>
        <p>
          All purchases are processed through the Apple App Store. Your subscription
          automatically renews at the end of each billing period unless you cancel at least
          24 hours before the renewal date. Your Apple ID account will be charged upon
          confirmation of purchase.
        </p>

        <p><strong style="color:#f0f0f5">Cancellation</strong></p>
        <p>
          You may cancel your subscription at any time through your Apple ID account settings
          (Settings → [your name] → Subscriptions). Cancellation takes effect at the end of
          the current billing period; you retain access to Pro features until then.
        </p>

        <p><strong style="color:#f0f0f5">Refunds</strong></p>
        <p>
          All purchases are subject to Apple's refund policies. To request a refund, visit
          <a href="https://reportaproblem.apple.com" target="_blank">reportaproblem.apple.com</a>.
        </p>
      </div>
    </section>

    <section>
      <h2>6. Intellectual Property</h2>
      <p>
        All content, features, and functionality of the App — including but not limited to
        the model algorithms, scoring systems, interface design, text, and graphics — are
        the exclusive property of TheBettingModel and are protected by applicable intellectual
        property laws.
      </p>
      <p>
        You may not reproduce, distribute, modify, create derivative works of, publicly
        display, or exploit any part of the App or its content without our prior written
        consent.
      </p>
    </section>

    <section>
      <h2>7. Prohibited Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the App for any unlawful purpose or in violation of any regulations</li>
        <li>Attempt to reverse-engineer, decompile, or extract the underlying model or algorithms</li>
        <li>Scrape, crawl, or systematically download App content via automated means</li>
        <li>Share your account credentials or subscription access with others</li>
        <li>Resell or redistribute picks or model output commercially without written permission</li>
      </ul>
    </section>

    <section>
      <h2>8. Disclaimer of Warranties</h2>
      <p>
        THE APP AND ALL CONTENT ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.
        THEBETTINGMODEL EXPRESSLY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>
      <p>
        We do not warrant that the App will be uninterrupted, error-free, or free of viruses.
        Model accuracy is not guaranteed, and no pick should be construed as financial advice.
      </p>
    </section>

    <section>
      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, THEBETTINGMODEL SHALL NOT BE LIABLE FOR
        ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING
        LOSS OF PROFITS, DATA, OR GOODWILL — ARISING FROM YOUR USE OF OR INABILITY TO USE
        THE APP, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p>
        OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR THE APP
        SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
      </p>
    </section>

    <section>
      <h2>10. Responsible Gambling</h2>
      <p>
        If you or someone you know has a problem with gambling, free help is available:
      </p>
      <ul>
        <li>
          <strong style="color:#f0f0f5">USA:</strong>
          National Problem Gambling Helpline —
          <a href="tel:18004264700">1-800-GAMBLER (1-800-426-2537)</a> or
          <a href="https://www.ncpgambling.org" target="_blank">ncpgambling.org</a>
        </li>
        <li>
          <strong style="color:#f0f0f5">UK:</strong>
          GamCare — <a href="https://www.gamcare.org.uk" target="_blank">gamcare.org.uk</a>
        </li>
        <li>
          <strong style="color:#f0f0f5">Australia:</strong>
          Gambling Help Online — <a href="https://www.gamblinghelponline.org.au" target="_blank">gamblinghelponline.org.au</a>
        </li>
      </ul>
    </section>

    <section>
      <h2>11. Governing Law</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws of the
        jurisdiction in which TheBettingModel operates, without regard to conflict of law
        principles. Any disputes arising from these Terms shall be resolved in the courts
        of that jurisdiction.
      </p>
    </section>

    <section>
      <h2>12. Contact Us</h2>
      <div class="card">
        <p>Questions about these Terms? Reach us at:</p>
        <p><a href="mailto:support@thebettingmodel.com">support@thebettingmodel.com</a></p>
      </div>
    </section>
  </main>

  <footer>
    &copy; ${new Date().getFullYear()} TheBettingModel. All rights reserved. &nbsp;·&nbsp;
    <a href="/api/privacy">Privacy Policy</a>
  </footer>
</body>
</html>`;

router.get("/terms", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(TERMS_HTML);
});

// ── Support ───────────────────────────────────────────────────────────────────

const SUPPORT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Support — TheBettingModel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f;
      --card: #111118;
      --border: #1e1e2e;
      --fg: #f0f0f5;
      --muted: #8888aa;
      --gold: #d4a843;
      --radius: 12px;
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
      padding: 0 16px 60px;
    }
    header {
      max-width: 680px;
      margin: 0 auto;
      padding: 48px 0 32px;
      border-bottom: 1px solid var(--border);
    }
    .logo {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
    .meta { font-size: 13px; color: var(--muted); }
    main { max-width: 680px; margin: 0 auto; padding-top: 36px; }
    section { margin-bottom: 36px; }
    h2 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    p { color: var(--muted); font-size: 15px; margin-bottom: 12px; }
    ul { color: var(--muted); font-size: 15px; padding-left: 20px; margin-bottom: 12px; }
    li { margin-bottom: 6px; }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .card h3 {
      font-size: 15px;
      font-weight: 700;
      color: var(--fg);
      margin-bottom: 8px;
    }
    .contact-btn {
      display: inline-block;
      background: var(--gold);
      color: #000;
      font-weight: 700;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 10px;
      text-decoration: none;
      margin-top: 8px;
    }
    .contact-btn:hover { opacity: 0.88; text-decoration: none; }
    footer {
      max-width: 680px;
      margin: 48px auto 0;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">TheBettingModel</div>
    <h1>Support</h1>
    <p class="meta">We're here to help — typical response within 24 hours.</p>
  </header>

  <main>
    <section>
      <h2>Contact Us</h2>
      <div class="card">
        <h3>Email Support</h3>
        <p>For account issues, subscription questions, billing, or anything else, email us directly and we'll get back to you within 24 hours.</p>
        <a class="contact-btn" href="mailto:Jacqueskaune@gmail.com">Email Support</a>
      </div>
    </section>

    <section>
      <h2>Frequently Asked Questions</h2>

      <div class="card">
        <h3>How do I cancel my subscription?</h3>
        <p>
          Open the Settings app on your iPhone → tap your name → Subscriptions → find TheBettingModel → tap Cancel Subscription.
          Your Pro access continues until the end of the current billing period.
        </p>
      </div>

      <div class="card">
        <h3>How do I restore a purchase I already made?</h3>
        <p>
          Open the app and go to the Membership screen. Tap <strong style="color:#f0f0f5">Restore Purchases</strong> at the bottom.
          Make sure you are signed in with the same Apple ID used for the original purchase.
        </p>
      </div>

      <div class="card">
        <h3>I was charged but the app says I'm not subscribed.</h3>
        <p>
          Tap <strong style="color:#f0f0f5">Restore Purchases</strong> on the Membership screen to sync your purchase.
          If the issue persists after restoring, email us with your Apple ID email and we'll investigate.
        </p>
      </div>

      <div class="card">
        <h3>How do I request a refund?</h3>
        <p>
          All purchases are processed through the Apple App Store. To request a refund, visit
          <a href="https://reportaproblem.apple.com" target="_blank">reportaproblem.apple.com</a>
          and sign in with your Apple ID.
        </p>
      </div>

      <div class="card">
        <h3>I'm not receiving push notifications.</h3>
        <p>
          Go to your iPhone Settings → Notifications → TheBettingModel and make sure notifications are allowed.
          Then open the app, go to Profile → Notification Settings, and confirm your preferred sports are enabled.
        </p>
      </div>

      <div class="card">
        <h3>How does the model work?</h3>
        <p>
          TheBettingModel uses a machine-learning model trained on historical game data, real-time odds,
          line movement, team and player signals, and public betting market data. Picks are updated daily
          and graded automatically after each game. Past performance is not a guarantee of future results.
        </p>
      </div>

      <div class="card">
        <h3>How do I delete my account?</h3>
        <p>
          Go to Profile in the app and tap <strong style="color:#f0f0f5">Delete Account</strong>, or email us at
          <a href="mailto:Jacqueskaune@gmail.com">Jacqueskaune@gmail.com</a> and we'll delete your data within 30 days.
        </p>
      </div>
    </section>

    <section>
      <h2>Still need help?</h2>
      <p>
        If your question isn't covered above, email us at
        <a href="mailto:Jacqueskaune@gmail.com">Jacqueskaune@gmail.com</a>.
        Please include your Apple ID email and a description of the issue so we can assist you quickly.
      </p>
    </section>
  </main>

  <footer>
    &copy; ${new Date().getFullYear()} TheBettingModel. All rights reserved. &nbsp;·&nbsp;
    <a href="/api/privacy">Privacy Policy</a> &nbsp;·&nbsp;
    <a href="/api/terms">Terms of Use</a>
  </footer>
</body>
</html>`;

router.get("/support", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(SUPPORT_HTML);
});

export default router;
