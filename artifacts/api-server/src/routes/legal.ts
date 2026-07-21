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

export default router;
